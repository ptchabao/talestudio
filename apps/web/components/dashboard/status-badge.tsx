"use client";

import { useI18n } from "@/i18n/client";
import type { EpisodeStatus } from "@talestudio/core";
import { Badge } from "@talestudio/ui/badge";
import { CheckCircle2, CircleDot, CircleSlash, Loader2, XCircle } from "lucide-react";

export function StatusBadge({ status }: { status: EpisodeStatus }) {
  const { t } = useI18n();
  const label = t.status[status];
  if (status === "completed") return <Badge variant="success"><CheckCircle2 />{label}</Badge>;
  if (status === "storyboard_ready") return <Badge variant="outline"><CircleDot />{label}</Badge>;
  if (status === "failed") return <Badge variant="destructive"><XCircle />{label}</Badge>;
  if (status === "canceled") return <Badge variant="secondary"><CircleSlash />{label}</Badge>;
  return <Badge variant="secondary"><Loader2 className="animate-spin" />{label}</Badge>;
}
