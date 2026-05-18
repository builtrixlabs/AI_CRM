"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { viewsFormAction } from "./actions";
import type { ViewEntityType } from "@/lib/views/types";

export function NewViewDialog(props: { entityType: ViewEntityType }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid={`new-view-${props.entityType}`}
      >
        + Add view
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New shared view</DialogTitle>
            <DialogDescription>
              Visible to everyone in this org on the {props.entityType} list page.
            </DialogDescription>
          </DialogHeader>
          <form
            action={async (fd) => {
              await viewsFormAction(fd);
              setOpen(false);
            }}
            className="space-y-3"
          >
            <input type="hidden" name="intent" value="create" />
            <input type="hidden" name="scope" value="org" />
            <input type="hidden" name="entity_type" value={props.entityType} />

            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="Hot Meta leads (this month)"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                name="slug"
                placeholder="hot-meta-leads"
                pattern="^[a-z][a-z0-9-]{0,49}$"
                title="lowercase, kebab-case, starts with a letter"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filters">Filters (JSON)</Label>
              <Textarea
                id="filters"
                name="filters"
                rows={4}
                defaultValue="[]"
                className="font-mono text-xs"
              />
              <p className="text-xs text-neutral-500">
                Array of <code>{`{ field, kind, op, value? }`}</code> clauses.
                See directives/413-custom-views-engine.md for the grammar.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="columns">Columns (JSON)</Label>
              <Textarea
                id="columns"
                name="columns"
                rows={3}
                defaultValue='[{"field":"label","label":"Lead"},{"field":"state","label":"State"},{"field":"created_at","label":"Created"}]'
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sort">Sort (JSON, nullable)</Label>
              <Textarea
                id="sort"
                name="sort"
                rows={2}
                defaultValue='{"field":"created_at","dir":"desc"}'
                className="font-mono text-xs"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save view</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
