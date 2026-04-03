import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { AssistantStatusProvider } from "@/providers/AssistantStatusContext";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  return (
    <AssistantStatusProvider>
      <div className="min-h-screen bg-gray-50">
        <Sidebar
          userName={session?.user?.name ?? "Artisan"}
          userEmail={session?.user?.email ?? ""}
        />
        {/* Main content — offset for desktop sidebar and mobile top bar */}
        <div className="lg:ml-64 pt-14 lg:pt-0">
          {children}
        </div>
      </div>
    </AssistantStatusProvider>
  );
}
