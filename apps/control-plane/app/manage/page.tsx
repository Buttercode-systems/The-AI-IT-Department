import WorkspaceControls from "../workspace-controls";

export const metadata = { title: "Manage AID" };

export default function ManagePage() {
  return <main className="manage-page"><header><div><a href="/">← Back to AID</a><h1>Manage AID</h1><p>Review memory, scheduled workflows, account data and privacy controls.</p></div></header><WorkspaceControls /></main>;
}
