import { notFound } from "next/navigation";
import { pageData } from "@/lib/server";
import { Card, PageHeader } from "@/components/ui";
import { CaseForm } from "@/components/case-form";

export const metadata = { title: "Edit case" };

export default async function EditCase({ params }: { params: { id: string } }) {
  const { ws } = await pageData();
  const c = ws.cases.find((x) => x.id === params.id);
  if (!c) notFound();
  return (
    <>
      <PageHeader title={`Edit ${c.number}`} />
      <Card>
        <CaseForm caseId={c.id} clients={ws.clients.map((x) => ({ id: x.id, name: x.name }))}
          initial={{ number: c.number, cnr: c.cnr ?? "", petitioner: c.parties.petitioner, respondent: c.parties.respondent, court: c.court, caseType: c.caseType, stage: c.stage, clientId: c.clientId }} />
      </Card>
    </>
  );
}
