"use client";

import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { loadDirectory } from "@/app/network-actions";
import type { CommunityContext } from "@/lib/network/discovery";
import { brandFor } from "@/lib/brand";
import styles from "./network-workspace.module.css";

type Directory = Awaited<ReturnType<typeof loadDirectory>>;

// The community landing at /c/{slug}. The slug is resolved to this community
// server-side (unknown slugs 404 before we get here); this view renders the
// brand from that context and loads the membership-gated directory for the
// signed-in member. Copy follows the community's configured locale, not a
// hardcoded tenant.
export function CommunityDirectory({ community }: { community: CommunityContext }) {
  const { data: session, status } = useSession();
  const brand = brandFor(community.locale);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [page, setPage] = useState<string | undefined>();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setDirectory(null); setError("");
    if (status !== "authenticated") return;
    void loadDirectory(community.id, page)
      .then(data => { if (active) setDirectory(data); })
      .catch(() => { if (active) setError(brand.spanish
        ? "Este directorio no está disponible para tu cuenta. Pide acceso al administrador de la comunidad."
        : "This directory is not available to your account. Ask a community administrator for access."); });
    return () => { active = false; };
  }, [community.id, page, status, session?.user?.id, brand.spanish]);

  const t = (en: string, es: string) => (brand.spanish ? es : en);

  return <main className={styles.shell} lang={community.locale}>
    <header className={styles.header}>
      <a href="/" className={styles.brand}>Collab<span>{t("Local communities. Shared connections.", "Comunidades locales. Conexiones compartidas.")}</span></a>
      {status === "authenticated" && <button onClick={() => { setDirectory(null); void signOut(); }}>{t("Sign out", "Cerrar sesión")}</button>}
    </header>
    <section className={styles.panel}>
      {community.logo && <img className={styles.loginLogo} src={community.logo} alt={community.name} width={240} height={240} />}
      <p className={styles.eyebrow}>{community.shortName}</p>
      <h1>{community.name}</h1>
      {community.description && <p>{community.description}</p>}
    </section>
    {status === "loading" ? <p role="status">{t("Loading…", "Cargando…")}</p> :
      status !== "authenticated" ? <section className={styles.panel}>
        <p>{t("Sign in to view this community's member directory.", "Inicia sesión para ver el directorio de miembros de esta comunidad.")}</p>
        <button onClick={() => void signIn("google")}>{t("Continue with Google", "Continuar con Google")}</button>
      </section> : <section className={styles.panel}>
        <h2>{t("Business directory", "Directorio de negocios")}</h2>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {!directory && !error && <p role="status">{t("Loading businesses…", "Cargando negocios…")}</p>}
        {directory && !directory.organizations.length && <p>{t("No businesses are listed here yet.", "Aún no hay negocios en este directorio.")}</p>}
        <div className={styles.grid}>{directory?.organizations.map(org => <article key={org.id} className={styles.card}>
          <p className={styles.eyebrow}>{org.kind}</p><h3>{org.name}</h3>
          <p>{org.description || t("Business profile coming soon.", "Perfil del negocio próximamente.")}</p>
          {org.localOffer && <p><strong>{t("Local offer: ", "Oferta local: ")}</strong>{org.localOffer}</p>}
          {org.serviceAreas && <p><small>{t("Service areas: ", "Áreas de servicio: ")}{org.serviceAreas}</small></p>}
        </article>)}</div>
        {page && <button onClick={() => setPage(undefined)}>{t("First page", "Primera página")}</button>}
        {directory?.nextCursor && <button onClick={() => setPage(directory.nextCursor ?? undefined)}>{t("Next page", "Página siguiente")}</button>}
      </section>}
  </main>;
}
