import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { getSession } from "@/lib/session";
import { getPrisma } from "@/lib/db/prisma";
import { getProfileView } from "@/lib/profile/service";
import { currentSessionToken } from "@/lib/profile/http";
import { DELETE_CONFIRMATION, DELETION_WAIT_DAYS, PRACTICE_AREAS, STATE_BAR_COUNCILS } from "@/lib/profile/constants";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { DeleteAccountForm, EmailChangeForm, PasswordForm, PhoneForm, PhotoForm, ProfileDetailsForm, SessionsControl } from "@/components/profile-forms";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function Profile() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mode !== "password") {
    return (
      <>
        <PageHeader title="Profile" />
        <Notice tone="neutral" title="Profiles are for signed-in accounts">This is the shared demo, so there is no personal profile. On a sign-in deployment, each advocate manages their own details, mobile, email, password and account here.</Notice>
      </>
    );
  }
  const view = await getProfileView(session.userId, await currentSessionToken(headers()));
  const courts = await getPrisma()!.court.findMany({ where: { OR: [{ officeId: null }, { officeId: session.officeId }] }, orderBy: [{ level: "asc" }, { name: "asc" }], select: { id: true, name: true } });
  const p = view.profile;
  const verified = (ok: boolean) => (ok ? <Badge tone="ok">Verified</Badge> : <Badge tone="warn">Not verified</Badge>);

  return (
    <>
      <PageHeader title="Profile" subtitle={`${view.account.name} · ${view.offices.map((o) => `${o.name} (${o.role})`).join(", ")}`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Professional details">
            <ProfileDetailsForm
              councils={STATE_BAR_COUNCILS} areas={PRACTICE_AREAS} courts={courts}
              initial={{ name: view.account.name, barEnrolmentNo: p.barEnrolmentNo, stateBarCouncil: p.stateBarCouncil, yearsOfPractice: p.yearsOfPractice, practiceAreas: p.practiceAreas,
                officeAddressLine1: p.officeAddressLine1, officeAddressLine2: p.officeAddressLine2, officeCity: p.officeCity, officeState: p.officeState, officePincode: p.officePincode,
                preferredCourtIds: p.preferredCourts.map((c) => c.id), preferredCourtLocations: p.preferredCourtLocations }}
            />
          </Card>
          <Card title="Email address">
            <p className="mb-3 flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{view.account.email}</span>{verified(view.account.emailVerified)}</p>
            <EmailChangeForm current={view.account.email} />
          </Card>
          <Card title="Mobile number">
            <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">{view.account.phoneNumber ? <><span className="font-medium">{view.account.phoneNumber}</span>{verified(view.account.phoneNumberVerified)}</> : <span className="text-muted">No mobile number yet.</span>}</p>
            <PhoneForm current={view.account.phoneNumber} />
          </Card>
          <Card title="Password">
            <PasswordForm />
            <p className="mt-3 text-xs text-muted">Forgot it? <Link className="link" href="/forgot-password">Reset it by email</Link> (signs you out everywhere).</p>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Profile completion">
            <div className="mb-2 flex items-center justify-between text-sm"><span>{view.completion.percent}% complete</span></div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-soft" role="progressbar" aria-valuenow={view.completion.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completion">
              <div className="h-full bg-navy-900" style={{ width: `${view.completion.percent}%` }} />
            </div>
            {view.completion.missing.length ? (
              <ul className="mt-3 space-y-1 text-sm">{view.completion.missing.map((m) => <li key={m.key} className="flex items-center gap-2 text-muted"><CircleDashed className="h-4 w-4" aria-hidden />{m.label}</li>)}</ul>
            ) : <p className="mt-3 flex items-center gap-2 text-sm text-ok"><CheckCircle2 className="h-4 w-4" aria-hidden />All details complete.</p>}
            <p className="mt-3 text-xs text-muted">Missing details never block your work; they help colleagues and clients reach you.</p>
          </Card>
          <Card title="Photo"><PhotoForm hasPhoto={!!view.photo} url={view.photo?.url ?? null} /></Card>
          <Card title="Sign-in and devices">
            <ul className="mb-3 space-y-1 text-sm">
              <li className="flex items-center justify-between">Email {verified(view.account.emailVerified)}</li>
              <li className="flex items-center justify-between">Mobile {view.account.phoneNumber ? verified(view.account.phoneNumberVerified) : <Badge tone="neutral">Not added</Badge>}</li>
              <li className="flex items-center justify-between">Two-step login {view.security.twoStepLogin === "required" ? <Badge tone="ok">On</Badge> : <Badge tone="warn">Off on this site</Badge>}</li>
            </ul>
            <SessionsControl others={view.security.otherSessions} />
          </Card>
          <Card title="Delete account">
            <p className="mb-3 text-sm text-muted">Ask for your account to be deleted. You will see exactly what happens before confirming.</p>
            <DeleteAccountForm confirmPhrase={DELETE_CONFIRMATION} waitDays={DELETION_WAIT_DAYS} />
          </Card>
        </div>
      </div>
    </>
  );
}
