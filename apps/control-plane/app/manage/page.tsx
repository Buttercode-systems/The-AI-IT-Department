import WorkspaceControls from "../workspace-controls";

export const metadata = { title: "Manage AID" };

export default function ManagePage() {
  return (
    <main className="manage-page">
      <header className="manage-header">
        <a className="manage-back" href="/">← Back to conversation</a>
        <div className="manage-title-row">
          <div>
            <span className="manage-eyebrow">Control centre</span>
            <h1>Manage AID</h1>
            <p>Review what AID remembers, what it can run, and how your account data is handled.</p>
          </div>
          <div className="manage-brand" aria-hidden="true">AID</div>
        </div>
      </header>
      <WorkspaceControls />
    </main>
  );
}
