"use client";

import { useEffect, useRef, useState } from "react";
import { loadBusinessCrm, saveBusinessCrm } from "@/app/network-actions";
import { BusinessCrmTool } from "./networking-crm-tool";

type Loaded = Awaited<ReturnType<typeof loadBusinessCrm>>;

export function BusinessCrmWorkspace() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const revision = useRef(0);

  useEffect(() => {
    let active = true;
    void loadBusinessCrm().then(result => {
      if (!active) return;
      revision.current = result.revision;
      setData(result);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "CRM is unavailable."); });
    return () => { active = false; };
  }, []);

  if (error) return <section className="glass-panel tool-panel"><p className="section-label">Business CRM</p><p role="alert">{error}</p></section>;
  if (!data) return <section className="glass-panel tool-panel"><p role="status">Loading business CRM…</p></section>;
  return <section aria-labelledby="business-crm-heading"><div className="crm-workspace-heading"><p className="section-label">PRIVATE BUSINESS WORKSPACE</p><h2 id="business-crm-heading">{data.business.name} CRM</h2><p>Contacts, follow-ups, and sales opportunities for this member business.</p></div><BusinessCrmTool businessId={data.business.id} initialWorkspace={data.workspace} onPersist={async workspace => { const result = await saveBusinessCrm(workspace, revision.current); revision.current = result.revision; }} /></section>;
}
