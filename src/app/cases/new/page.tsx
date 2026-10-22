import { pageData } from "@/lib/server";
import { Card, PageHeader } from "@/components/ui";
import { CaseForm } from "@/components/case-form";

export const metadata = { title: "New case" };

export default async function NewCase() {
  const { ws } = await pageData();
  return (
    <>
      <PageHeader title="New case" subtitle="Create a case without uploading an order. You can add orders to it later." />
      <Card><CaseForm clients={ws.clients.map((c) => ({ id: c.id, name: c.name }))} /></Card>
    </>
  );
}
