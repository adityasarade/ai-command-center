import { Sidebar } from './Sidebar';

export default function DocsLayout({ children }) {
  return (
    <div className="wrap docs-shell">
      <Sidebar />
      <article className="prose">{children}</article>
    </div>
  );
}
