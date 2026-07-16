import "./styles.css";
import "./chat-v2.css";
import "./approval.css";
import "./legal.css";
import "./manage.css";
import ApprovalDock from "./approval-dock";
import ManageLauncher from "./manage-launcher";

export const metadata = {
  title: "AID — AI IT Department",
  description: "A conversational AI assistant for your connected business workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<ManageLauncher /><ApprovalDock /></body>
    </html>
  );
}
