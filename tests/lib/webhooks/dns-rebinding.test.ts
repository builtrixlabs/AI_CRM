import { describe, it, expect } from "vitest";
import {
  blockedIpv4,
  blockedIpv6,
  resolveAndCheck,
  type ResolverFn,
} from "@/lib/webhooks/dns-rebinding";

describe("blockedIpv4", () => {
  it.each([
    ["10.0.0.1", "private_v4"],
    ["10.255.255.255", "private_v4"],
    ["127.0.0.1", "loopback_v4"],
    ["127.1.2.3", "loopback_v4"],
    ["169.254.169.254", "link_local_v4"],
    ["172.16.0.1", "private_v4"],
    ["172.31.255.255", "private_v4"],
    ["192.168.1.1", "private_v4"],
    ["192.0.0.5", "ietf_v4"],
    ["100.64.0.1", "cgnat_v4"],
    ["198.18.0.1", "benchmark_v4"],
    ["224.0.0.1", "multicast_v4"],
    ["240.0.0.1", "reserved_v4"],
    ["255.255.255.255", "reserved_v4"],
    ["0.0.0.0", "reserved_v4"],
  ])("blocks %s as %s", (ip, reason) => {
    expect(blockedIpv4(ip)).toBe(reason);
  });

  it.each([
    ["8.8.8.8"],
    ["1.1.1.1"],
    ["172.32.0.1"],
    ["172.15.255.255"],
    ["100.63.255.255"],
    ["100.128.0.1"],
    ["198.20.0.1"],
    ["13.107.21.200"],
  ])("allows public %s", (ip) => {
    expect(blockedIpv4(ip)).toBeNull();
  });

  it("rejects malformed", () => {
    expect(blockedIpv4("not.an.ip.x")).toBe("invalid_ipv4");
    expect(blockedIpv4("1.2.3")).toBe("invalid_ipv4");
    expect(blockedIpv4("256.0.0.1")).toBe("invalid_ipv4");
  });
});

describe("blockedIpv6", () => {
  it.each([
    ["::1", "loopback_v6"],
    ["::", "unspecified_v6"],
    ["fe80::1", "link_local_v6"],
    ["fc00::1", "ula_v6"],
    ["fd12::1", "ula_v6"],
    ["ff02::1", "multicast_v6"],
    ["::ffff:127.0.0.1", "mapped_loopback_v4"],
    ["::ffff:10.0.0.1", "mapped_private_v4"],
  ])("blocks %s as %s", (ip, reason) => {
    expect(blockedIpv6(ip)).toBe(reason);
  });

  it.each([
    ["2606:4700:4700::1111"],
    ["2001:db8::1"],
    ["::ffff:8.8.8.8"], // public mapped
  ])("allows public %s", (ip) => {
    expect(blockedIpv6(ip)).toBeNull();
  });
});

describe("resolveAndCheck", () => {
  const fakeResolver = (records: Array<{ address: string; family: 4 | 6 }>): ResolverFn =>
    () => Promise.resolve(records);

  it("passes for IP literals (delegates to syntactic check)", async () => {
    expect(await resolveAndCheck("8.8.8.8", () => Promise.reject(new Error("nope")))).toBeNull();
    expect(await resolveAndCheck("2606:4700::1", () => Promise.reject(new Error("nope")))).toBeNull();
  });

  it("returns null when all records are public", async () => {
    const r = await resolveAndCheck("api.example.com", fakeResolver([
      { address: "8.8.8.8", family: 4 },
      { address: "2606:4700::1111", family: 6 },
    ]));
    expect(r).toBeNull();
  });

  it("rejects when ANY record is private (rebind defense)", async () => {
    const r = await resolveAndCheck("evil.example.com", fakeResolver([
      { address: "13.107.21.200", family: 4 }, // public
      { address: "10.0.0.1", family: 4 },      // private — should poison the result
    ]));
    expect(r).toMatch(/^private_v4:10\.0\.0\.1$/);
  });

  it("rejects 169.254.169.254 (cloud metadata)", async () => {
    const r = await resolveAndCheck("metadata.example", fakeResolver([
      { address: "169.254.169.254", family: 4 },
    ]));
    expect(r).toBe("link_local_v4:169.254.169.254");
  });

  it("rejects on resolver error (fail-closed)", async () => {
    const r = await resolveAndCheck("never.resolves", () => Promise.reject(new Error("ENOTFOUND")));
    expect(r).toMatch(/^dns_lookup_failed:/);
  });

  it("rejects when resolver returns empty record set", async () => {
    const r = await resolveAndCheck("noaaaa.example", fakeResolver([]));
    expect(r).toBe("dns_no_records");
  });

  it("rejects ipv4-mapped private addresses via v6 record", async () => {
    const r = await resolveAndCheck("dual.example", fakeResolver([
      { address: "::ffff:10.1.2.3", family: 6 },
    ]));
    expect(r).toMatch(/^mapped_private_v4:/);
  });
});
