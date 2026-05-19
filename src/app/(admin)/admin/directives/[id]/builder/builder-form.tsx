"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ACTION_KINDS,
  ACTION_LABEL,
  TRIGGER_KINDS,
  TRIGGER_LABEL,
} from "@/lib/workflow-builder";
import type {
  ActionKind,
  CompiledDag,
  DagNode,
  SandboxNodeTrace,
  TestPayloadEntry,
  TriggerKind,
} from "@/lib/workflow-builder";
import {
  newVersionAction,
  publishWorkflowAction,
  saveDagAction,
  sandboxTestAction,
} from "./actions";

type ActionRow = {
  id: string;
  action_kind: ActionKind;
  config: Record<string, unknown>;
};

type Props = {
  directiveId: string;
  initialDag: CompiledDag | null;
  canPublish: boolean;
  lifecycleStatus: string;
  testPayloads: TestPayloadEntry[];
};

const uid = (): string =>
  `n-${Math.random().toString(36).slice(2, 10)}`;

function loadInitial(dag: CompiledDag | null): {
  trigger: TriggerKind;
  triggerConfig: string;
  actions: ActionRow[];
} {
  if (!dag) {
    return {
      trigger: "lead.created",
      triggerConfig: "{}",
      actions: [],
    };
  }
  const trig = dag.nodes.find((n) => n.kind === "trigger");
  const acts: ActionRow[] = [];
  for (const n of dag.nodes) {
    if (n.kind === "action") {
      acts.push({
        id: n.id,
        action_kind: n.action_kind,
        config: n.config,
      });
    }
  }
  return {
    trigger: trig?.kind === "trigger" ? trig.trigger_kind : "lead.created",
    triggerConfig: trig
      ? JSON.stringify(trig.kind === "trigger" ? trig.config : {}, null, 2)
      : "{}",
    actions: acts,
  };
}

function tryParseJson(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function BuilderForm(props: Props) {
  const initial = useMemo(() => loadInitial(props.initialDag), [props.initialDag]);
  const [trigger, setTrigger] = useState<TriggerKind>(initial.trigger);
  const [triggerConfigText, setTriggerConfigText] = useState(initial.triggerConfig);
  const [actions, setActions] = useState<ActionRow[]>(initial.actions);
  const [samplePayload, setSamplePayload] = useState<string>("{}");
  const [trace, setTrace] = useState<SandboxNodeTrace[] | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const addAction = () => {
    setActions((arr) => [
      ...arr,
      { id: uid(), action_kind: "send_template_message", config: {} },
    ]);
  };

  const removeAction = (id: string) => {
    setActions((arr) => arr.filter((a) => a.id !== id));
  };

  const moveUp = (id: string) => {
    setActions((arr) => {
      const i = arr.findIndex((a) => a.id === id);
      if (i <= 0) return arr;
      const next = arr.slice();
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  };

  const buildDagInput = (): { nodes: DagNode[]; edges: { from: string; to: string }[] } | null => {
    const triggerCfg = tryParseJson(triggerConfigText);
    if (triggerCfg === null) return null;
    const triggerNode: DagNode = {
      id: "trigger",
      kind: "trigger",
      trigger_kind: trigger,
      config: triggerCfg,
    };
    const actionNodes: DagNode[] = actions.map((a) => ({
      id: a.id,
      kind: "action",
      action_kind: a.action_kind,
      config: a.config,
    }));
    const edges: { from: string; to: string }[] = [];
    let prev = triggerNode.id;
    for (const a of actionNodes) {
      edges.push({ from: prev, to: a.id });
      prev = a.id;
    }
    return { nodes: [triggerNode, ...actionNodes], edges };
  };

  const onSave = () => {
    setError(null);
    setInfo(null);
    const built = buildDagInput();
    if (!built) {
      setError("Trigger config must be a JSON object.");
      return;
    }
    start(async () => {
      const r = await saveDagAction(props.directiveId, built);
      if (!r.ok) setError(`Save failed: ${r.reason}${r.message ? ` (${r.message})` : ""}`);
      else setInfo("Saved. Run Test before Publish.");
    });
  };

  const onTest = () => {
    setError(null);
    setInfo(null);
    setTrace(null);
    const parsed = tryParseJson(samplePayload);
    if (parsed === null) {
      setError("Sample payload must be a JSON object.");
      return;
    }
    start(async () => {
      const r = await sandboxTestAction(props.directiveId, parsed);
      if (!r.ok) {
        if (r.reason === "no_dag") {
          setError("Save the workflow first, then run Test.");
        } else {
          setError(`Test failed: ${r.reason}${r.message ? ` (${r.message})` : ""}`);
        }
        return;
      }
      setTrace(r.data?.trace ?? []);
      setInfo("Test passed. Publish is now available for this session.");
    });
  };

  const onPublish = () => {
    setError(null);
    setInfo(null);
    start(async () => {
      const r = await publishWorkflowAction(props.directiveId);
      if (!r.ok) {
        if (r.reason === "test_required") {
          setError("Run a successful Test against the current draft before publishing.");
        } else {
          setError(`Publish failed: ${r.reason}${r.message ? ` (${r.message})` : ""}`);
        }
        return;
      }
      setInfo("Published.");
    });
  };

  const onNewVersion = () => {
    setError(null);
    setInfo(null);
    start(async () => {
      const r = await newVersionAction(props.directiveId);
      if (!r.ok) setError(`New version failed: ${r.reason}`);
      else if (r.data?.id) window.location.href = `/admin/directives/${r.data.id}/builder`;
    });
  };

  const isLive = props.lifecycleStatus === "live";

  return (
    <div className="space-y-6" data-testid="builder-root">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trigger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Kind</Label>
            <select
              className="block h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as TriggerKind)}
              disabled={pending || isLive}
              data-testid="builder-trigger-kind"
            >
              {TRIGGER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {TRIGGER_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Trigger config (JSON object)</Label>
            <Textarea
              rows={3}
              value={triggerConfigText}
              onChange={(e) => setTriggerConfigText(e.target.value)}
              disabled={pending || isLive}
              data-testid="builder-trigger-config"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            Actions
            <Button
              size="sm"
              variant="outline"
              onClick={addAction}
              disabled={pending || isLive}
              data-testid="builder-add-action"
            >
              + Add action
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {actions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No actions yet. Add at least one before saving.
            </p>
          )}
          {actions.map((a, i) => (
            <div
              key={a.id}
              className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
              data-testid={`builder-action-${a.id}`}
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline">#{i + 1}</Badge>
                <select
                  className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                  value={a.action_kind}
                  onChange={(e) => {
                    const k = e.target.value as ActionKind;
                    setActions((arr) =>
                      arr.map((row) =>
                        row.id === a.id ? { ...row, action_kind: k } : row,
                      ),
                    );
                  }}
                  disabled={pending || isLive}
                >
                  {ACTION_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ACTION_LABEL[k]}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => moveUp(a.id)}
                  disabled={pending || isLive || i === 0}
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeAction(a.id)}
                  disabled={pending || isLive}
                >
                  Remove
                </Button>
              </div>
              <Textarea
                rows={3}
                value={JSON.stringify(a.config, null, 2)}
                onChange={(e) => {
                  const parsed = tryParseJson(e.target.value);
                  if (parsed !== null) {
                    setActions((arr) =>
                      arr.map((row) =>
                        row.id === a.id ? { ...row, config: parsed } : row,
                      ),
                    );
                  }
                }}
                disabled={pending || isLive}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Test with sample payload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={4}
            value={samplePayload}
            onChange={(e) => setSamplePayload(e.target.value)}
            disabled={pending}
            data-testid="builder-sample-payload"
            placeholder='{ "lead_id": "lead-1", "state": "qualified" }'
          />
          <Button onClick={onTest} disabled={pending} data-testid="builder-test">
            {pending ? "Testing…" : "Test"}
          </Button>
          {trace && (
            <div
              className="rounded-md border border-border bg-card p-3 text-xs"
              data-testid="builder-trace"
            >
              <p className="mb-2 font-medium">Per-node trace</p>
              <ul className="space-y-2">
                {trace.map((t) => (
                  <li key={t.node_id} data-testid={`trace-${t.node_id}`}>
                    <span className="font-mono">
                      {t.kind === "trigger" ? t.trigger_kind : t.action_kind}
                    </span>
                    <pre className="mt-1 whitespace-pre-wrap break-words text-[11px]">
                      input: {JSON.stringify(t.input)}
                      {"\n"}output: {JSON.stringify(t.output)}
                    </pre>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3" data-testid="builder-actions-bar">
        <Button
          onClick={onSave}
          disabled={pending || isLive}
          data-testid="builder-save"
        >
          Save
        </Button>
        <Button
          onClick={onPublish}
          disabled={pending || isLive || !props.canPublish}
          data-testid="builder-publish"
          variant="default"
        >
          Publish
        </Button>
        {isLive && (
          <Button
            onClick={onNewVersion}
            disabled={pending}
            data-testid="builder-new-version"
            variant="outline"
          >
            New version
          </Button>
        )}
      </div>
      {error && (
        <p className="text-sm text-destructive" data-testid="builder-error">
          {error}
        </p>
      )}
      {info && !error && (
        <p className="text-sm text-emerald-600" data-testid="builder-info">
          {info}
        </p>
      )}
    </div>
  );
}
