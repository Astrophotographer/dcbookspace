import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { isSupabaseConfigured } from "@/lib/config";
import { SetupNeeded } from "@/components/setup-needed";
import { qrDataUrl } from "@/lib/qr";
import { formatDate, resolveBaseUrl } from "@/lib/utils";
import { createServiceClient } from "@/lib/supabase/server";
import { getSeries } from "@/lib/repo";
import { weekdayLabel } from "@/lib/recurrence";
import type { ApprovalStep, AppUser } from "@/lib/supabase/types";
import { PrintAuto } from "@/app/reservations/[id]/print/print-auto";

export const dynamic = "force-dynamic";

type PageArgs = {
  params: Promise<{ id: string }>;
};

export default async function SeriesPrintPage(props: PageArgs) {
  if (!isSupabaseConfigured()) return <SetupNeeded />;

  const { id } = await props.params;
  const series = await getSeries(id);
  if (!series) notFound();

  // 지도장로 = 부서 elder
  let elder: AppUser | null = null;
  if (series.dept_id) {
    const supabase = createServiceClient();
    const { data: dep } = await supabase
      .from("departments")
      .select("*, elder:users!elder_id (*)")
      .eq("id", series.dept_id)
      .single();
    elder =
      ((dep as unknown as { elder: AppUser | null } | null)?.elder) ?? null;
  }

  const h = await headers();
  const baseUrl = resolveBaseUrl({
    envUrl: process.env.NEXT_PUBLIC_APP_URL,
    host: h.get("host"),
    proto: h.get("x-forwarded-proto"),
  });
  const qrUrl = `${baseUrl}/sign/${series.qr_token}`;
  const qr = await qrDataUrl(qrUrl, 110);

  const apprByOrder = new Map(series.approvals.map((a) => [a.step_order, a]));
  const steps = series.route.steps as ApprovalStep[];
  const createdLabel = formatDate(series.created_at, "yyyy 년   MM 월   dd 일");

  const blockLabel = series.time_blocks
    .map((b) => `${b.start}-${b.end}`)
    .join(", ");
  const totalRows = series.reservations.length;
  const occurrenceCount = totalRows / Math.max(1, series.time_blocks.length);

  // 회차 목록 — 시작 시각 순
  const occurrences = [...series.reservations].sort((a, b) =>
    a.start_at.localeCompare(b.start_at),
  );

  return (
    <>
      <PrintAuto />
      <main className="print-main">
        <div className="print-notice">
          <strong>인쇄 팁:</strong> 인쇄 대화상자에서{" "}
          <b>추가 설정(More settings) → 머리글 및 바닥글(Headers and footers)</b>{" "}
          체크를 해제하시면 상·하단의 URL·시간·페이지 번호가 사라집니다.
        </div>
        <div className="container">
          <h1 className="title">정기 장소 사용 신청서</h1>

          <div className="approval-wrapper">
            <div className="qr-box">
              {/* eslint-disable-next-line @next/next/no-img-element -- 인쇄용 base64 data URL */}
              <img src={qr} alt="전자결재용 QR" width={92} height={92} />
              <div className="qr-caption">전자결재용 QR</div>
            </div>
            <div className="approval-right">
              <div className="ref-no-top">신청번호 {series.ref_no ?? "—"}</div>
              <table className="approval-table">
              <tbody>
                <tr>
                  <th rowSpan={2} className="approval-stamp">
                    결<br />
                    <br />재
                  </th>
                  {steps.map((step) => (
                    <th key={step.order} className="approval-head">
                      {step.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  {steps.map((step) => {
                    const a = apprByOrder.get(step.order);
                    return (
                      <td key={step.order} className="approval-cell">
                        {a?.status === "approved" ? (
                          <div className="signed">
                            <div className="signed-name">
                              {a.approver?.name ?? ""}
                            </div>
                          </div>
                        ) : a?.status === "rejected" ? (
                          <div className="rejected">반려</div>
                        ) : a?.status === "skipped" ? (
                          <div className="skipped">건너뜀</div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
            </div>
          </div>

          <div className="content-body">
            아래와 같이 매주 정기적으로 장소를 사용하고자 하오니 허락하여
            주시기 바랍니다. 끝.
          </div>

          <div className="form-section">
            <FormLine label="반복">
              매주 {weekdayLabel(series.weekday)}요일 · {blockLabel}
            </FormLine>
            <FormLine label="기간">
              {series.start_date} ~ {series.end_date}
              <span className="muted">
                {" "}
                · 총 {occurrenceCount}회 × {series.time_blocks.length}시간대 ={" "}
                {totalRows}개 예약
              </span>
            </FormLine>
            <FormLine label="사용장소">
              {series.room.floor.building.name} {series.room.floor.label}{" "}
              {series.room.name}
            </FormLine>
            <FormLine label="사용목적">{series.purpose}</FormLine>
            <FormLine label="사용인원">
              {series.attendee_count}명{series.is_external && " (외부행사)"}
            </FormLine>
          </div>

          <div className="dates-section">
            <div className="dates-title">회차 일정</div>
            <ul className="dates-list">
              {occurrences.map((r) => (
                <li key={r.id}>
                  {format(parseISO(r.start_at), "M/d (E)", { locale: ko })}{" "}
                  {format(parseISO(r.start_at), "HH:mm")}–
                  {format(parseISO(r.end_at), "HH:mm")}
                </li>
              ))}
            </ul>
          </div>

          <div className="signature-section">
            <SigRow label="신청부서">{series.dept?.name ?? ""}</SigRow>
            <SigRow label="신청자" stamp>
              {series.applicant.name}
            </SigRow>
            <SigRow label="전화번호">{series.applicant.phone ?? ""}</SigRow>
            <SigRow label="지도장로" stamp>
              {elder?.name ?? ""}
            </SigRow>
          </div>

          <div className="date-section">신 청 일 : {createdLabel}</div>
        </div>

        <style>{`
          @page { size: A4 portrait; margin: 20mm; }

          .print-main {
            background: #d8d8d8;
            padding: 24px 0;
            min-height: 100vh;
          }
          .print-notice {
            max-width: 170mm;
            margin: 0 auto 16px;
            padding: 12px 16px;
            background: #fff8db;
            border: 1px solid #e8c84a;
            border-radius: 6px;
            font-size: 13px;
            line-height: 1.5;
            color: #5a4a00;
          }
          .container {
            font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
            color: #222;
            background: #fff;
            box-shadow: 0 0 12px rgba(0,0,0,.15);
            width: 170mm;
            min-height: 257mm;
            margin: 0 auto;
            padding: 12mm;
            box-sizing: border-box;
            position: relative;
            display: flex;
            flex-direction: column;
          }
          .title {
            text-align: center;
            font-size: 24pt;
            letter-spacing: 10px;
            margin: 24px 0 24px;
            font-weight: bold;
          }
          .approval-wrapper {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 28px;
          }
          .qr-box {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            margin-left: 14mm;
          }
          .qr-caption { font-size: 9pt; font-weight: 600; }
          .approval-right {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 4px;
          }
          .ref-no-top {
            font-size: 10pt;
            color: #000;
            font-weight: 600;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          }
          .approval-table {
            border-collapse: collapse;
            width: 300px;
            text-align: center;
          }
          .approval-table th, .approval-table td {
            border: 1px solid #000;
            padding: 4px;
            font-size: 10pt;
          }
          .approval-stamp {
            width: 22px;
            background: #f7f7f7;
            font-weight: bold;
            line-height: 1.1;
          }
          .approval-head { height: 24px; background: #f7f7f7; }
          .approval-cell { height: 60px; vertical-align: middle; }
          .signed-name { font-size: 10pt; font-weight: 600; color: #0c8a5e; }
          .rejected { color: #b91c1c; font-weight: bold; }
          .skipped { color: #888; font-size: 9pt; }
          .content-body {
            text-align: center;
            font-size: 13pt;
            margin: 24px 0 28px;
            line-height: 1.8;
          }
          .form-section { margin: 0 12mm 24px; }
          .form-group {
            display: flex;
            align-items: flex-end;
            margin-bottom: 14px;
          }
          .form-label {
            font-size: 11pt;
            font-weight: bold;
            width: 100px;
            white-space: nowrap;
          }
          .form-input-line {
            flex: 1;
            border-bottom: 1px solid #000;
            padding: 0 4px 3px;
            font-size: 11pt;
            min-height: 22px;
          }
          .muted { color: #666; font-size: 10pt; }

          .dates-section {
            margin: 0 12mm 24px;
            border: 1px solid #ccc;
            padding: 8px 10px;
            background: #fafafa;
          }
          .dates-title { font-size: 10pt; font-weight: bold; margin-bottom: 4px; }
          .dates-list {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 2px 12px;
            font-size: 10pt;
            list-style: none;
            padding: 0;
            margin: 0;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          }
          .dates-list li { padding: 1px 0; }

          .signature-section {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            margin: 8px 12mm 0 0;
          }
          .sig-row {
            display: flex;
            align-items: flex-end;
            margin-bottom: 10px;
            width: 280px;
          }
          .sig-label {
            width: 88px;
            font-size: 11pt;
            font-weight: bold;
            white-space: nowrap;
          }
          .sig-line {
            flex: 1;
            border-bottom: 1px solid #000;
            padding: 0 28px 3px 8px;
            font-size: 11pt;
            min-height: 20px;
            position: relative;
          }
          .sig-stamp {
            position: absolute;
            right: 4px;
            bottom: 2px;
            border: 1px solid #000;
            border-radius: 50%;
            width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 8pt;
          }
          .date-section {
            text-align: center;
            font-size: 13pt;
            font-weight: bold;
            margin-top: auto;
            padding-top: 18px;
            padding-bottom: 6mm;
            white-space: pre;
          }
          @media print {
            html, body {
              background: #fff !important;
              margin: 0;
              padding: 0;
              height: calc(297mm - 40mm);
              overflow: hidden;
            }
            .print-main { background: #fff; padding: 0; min-height: 0; height: auto; }
            .print-notice { display: none; }
            .container {
              width: auto;
              height: calc(297mm - 40mm);
              min-height: 0;
              max-height: calc(297mm - 40mm);
              margin: 0;
              box-shadow: none;
              overflow: hidden;
              page-break-inside: avoid;
              page-break-after: avoid;
            }
          }
        `}</style>
      </main>
    </>
  );
}

function FormLine({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="form-group">
      <div className="form-label">* {label} :</div>
      <div className="form-input-line">{children}</div>
    </div>
  );
}

function SigRow({
  label,
  children,
  stamp,
}: {
  label: string;
  children: React.ReactNode;
  stamp?: boolean;
}) {
  return (
    <div className="sig-row">
      <div className="sig-label">{label} :</div>
      <div className="sig-line">
        {children}
        {stamp && <div className="sig-stamp">인</div>}
      </div>
    </div>
  );
}
