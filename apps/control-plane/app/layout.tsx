import "./styles.css";
import "./approval.css";
import "./legal.css";
import ApprovalDock from "./approval-dock";

export const metadata = {
  title: "AID — AI IT Department",
  description: "A conversational AI assistant for your connected business workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<ApprovalDock /></body>
    </html>
  );
}
