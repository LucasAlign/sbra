import styles from "./login-introduction.module.css";

export function LoginIntroduction() {
  return <div className={styles.introduction}>
    <p className={styles.summary}>A shared directory and business networking hub for chambers, local business groups, and their members.</p>
    <dl className={styles.benefits}>
      <div><dt>Discover local businesses</dt><dd>Explore chamber communities and their member directories.</dd></div>
      <div><dt>Put your membership to work</dt><dd>A home for member tools, business opportunities, events, and useful introductions.</dd></div>
      <div><dt>Connect beyond your chamber</dt><dd>Build relationships with businesses and neighboring chambers across the region.</dd></div>
    </dl>
    <p className={styles.note}>Your chamber keeps its identity and community. Collab connects the network—starting in Berks County.</p>
  </div>;
}
