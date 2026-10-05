import { Body, Container, Head, Heading, Html, Preview, Section, Text, Link } from "@react-email/components";
// Relative import on purpose: the `npm run email` preview server does not resolve "@/".
import { formatMoney } from "../lib/format";

const PREVIEW = {
  type: "report-submitted",
  userName: "Boss",
  data: {
    departmentName: "Department 1",
    dateLabel: "Mon 05 Oct 2026",
    totals: { moneyIn: 77000, moneyOut: 19000, result: 58000, cashExpected: 66000, handedOver: 60000, variance: -500, stockValue: 27000, debtsClosing: 11000 },
    url: "https://example.com/boss/daily-reports/1",
  },
};

const styles = {
  body: { backgroundColor: "#f6f7f9", fontFamily: "Arial, sans-serif" },
  container: { backgroundColor: "#ffffff", margin: "0 auto", padding: "24px", borderRadius: "8px", maxWidth: "560px" },
  h1: { color: "#0f172a", fontSize: "20px", margin: "0 0 12px" },
  text: { color: "#334155", fontSize: "14px", lineHeight: "20px" },
  row: { display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e2e8f0", padding: "6px 0", fontSize: "14px" },
  section: { margin: "16px 0" },
  button: { display: "inline-block", backgroundColor: "#0f172a", color: "#ffffff", padding: "10px 16px", borderRadius: "6px", textDecoration: "none", fontSize: "14px" },
};

function Row({ label, value }) {
  return (
    <div style={styles.row}>
      <span>{label}</span>
      <strong>{value === null || value === undefined ? "—" : formatMoney(value)}</strong>
    </div>
  );
}

/** E-mails: a daily report was sent, reports are missing, monthly statement, guest house daily / weekly report. */
export default function EmailTemplate({ userName = PREVIEW.userName, type = PREVIEW.type, data = PREVIEW.data }) {
  if (type === "missing-reports") {
    return (
      <Html>
        <Head />
        <Preview>Daily reports not sent for {data.dateLabel}</Preview>
        <Body style={styles.body}>
          <Container style={styles.container}>
            <Heading style={styles.h1}>Daily reports not sent</Heading>
            <Text style={styles.text}>Hello {userName}, these departments have not sent their daily report for {data.dateLabel}:</Text>
            <Section style={styles.section}>
              {(data.departments || []).map((d) => (
                <Text key={d} style={styles.text}>• {d}</Text>
              ))}
            </Section>
            {data.url ? <Link href={data.url} style={styles.button}>Open daily reports</Link> : null}
          </Container>
        </Body>
      </Html>
    );
  }
  if (type === "stay-report") {
    const g = data.digest || {};
    const count = (v) => <strong>{v ?? "—"}</strong>;
    return (
      <Html>
        <Head />
        <Preview>{data.departmentName}: {data.kind === "weekly" ? "weekly" : "daily"} report of {data.periodLabel}</Preview>
        <Body style={styles.body}>
          <Container style={styles.container}>
            <Heading style={styles.h1}>{data.departmentName}: {data.kind === "weekly" ? "weekly" : "daily"} report</Heading>
            <Text style={styles.text}>Hello {userName}, here is {data.periodLabel}.</Text>
            <Section style={styles.section}>
              <div style={styles.row}><span>Bookings made · arrivals</span>{count(`${g.bookings} · ${g.arrivals}`)}</div>
              <div style={styles.row}><span>Occupied · available apartments (now)</span>{count(`${g.occupied} · ${g.available} of ${g.apartments}`)}</div>
              <div style={styles.row}><span>Check-ins · check-outs</span>{count(`${g.checkIns} · ${g.checkOuts}`)}</div>
              <div style={styles.row}><span>Occupancy</span>{count(`${g.occupancyRate}%`)}</div>
              <Row label="Revenue generated" value={g.revenue} />
              <Row label="Cash received" value={g.cashReceived} />
              <Row label="Cash handed over" value={g.handedOver} />
              <Row label="Cash still to hand over" value={g.toHandOver} />
              <Row label="Outstanding balances" value={g.outstanding} />
              <Row label="Expenses" value={g.expenses} />
              <Row label="Maintenance expenses" value={g.maintenance} />
              <Row label="Net income" value={g.netIncome} />
              <Row label="Cash discrepancies" value={g.discrepancies} />
            </Section>
            {(g.byApartment || []).length ? (
              <Section style={styles.section}>
                <Text style={{ ...styles.text, fontWeight: "bold" }}>Revenue by apartment</Text>
                {g.byApartment.map((a) => <Row key={a.name} label={`${a.name} (profit ${formatMoney(a.profit)})`} value={a.revenue} />)}
              </Section>
            ) : null}
            {(g.pendingRepairs || []).length ? (
              <Section style={styles.section}>
                <Text style={{ ...styles.text, fontWeight: "bold" }}>Repairs pending</Text>
                {g.pendingRepairs.map((r) => <Text key={`${r.room}${r.title}`} style={styles.text}>• {r.room}: {r.title} ({r.priority.toLowerCase()})</Text>)}
              </Section>
            ) : null}
            {g.unvalidated ? <Text style={styles.text}>{g.unvalidated} expense(s) are waiting for validation.</Text> : null}
            {data.url ? <Link href={data.url} style={styles.button}>Open the full report</Link> : null}
          </Container>
        </Body>
      </Html>
    );
  }
  if (type === "monthly-statement") {
    const i = data.income || {};
    return (
      <Html>
        <Head />
        <Preview>{data.organizationName}: statement for {data.periodLabel}</Preview>
        <Body style={styles.body}>
          <Container style={styles.container}>
            <Heading style={styles.h1}>Statement for {data.periodLabel}</Heading>
            <Text style={styles.text}>Hello {userName}, here is the month of {data.organizationName}.</Text>
            <Section style={styles.section}>
              <Row label="Money in" value={i.moneyIn} />
              <Row label="Money out" value={i.moneyOut} />
              <Row label="Result" value={i.result} />
              <Row label="Cash handed to you" value={data.handedOver} />
              <Row label="Debts owed by customers" value={data.debtsClosing} />
            </Section>
            {(data.insights || []).length ? (
              <Section style={styles.section}>
                {data.insights.map((t) => (
                  <Text key={t} style={styles.text}>• {t}</Text>
                ))}
              </Section>
            ) : null}
            <Text style={styles.text}>{data.coverageText}</Text>
            {data.url ? <Link href={data.url} style={styles.button}>Open the statements</Link> : null}
          </Container>
        </Body>
      </Html>
    );
  }
  const t = data.totals || {};
  return (
    <Html>
      <Head />
      <Preview>{data.departmentName}: daily report of {data.dateLabel}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Heading style={styles.h1}>{data.departmentName} sent the report of {data.dateLabel}</Heading>
          <Text style={styles.text}>Hello {userName}, the report is waiting for your review.</Text>
          <Section style={styles.section}>
            <Row label="Money in" value={t.moneyIn} />
            <Row label="Money out" value={t.moneyOut} />
            <Row label="Result of the day" value={t.result} />
            <Row label="Cash expected" value={t.cashExpected} />
            <Row label="Handed over to you" value={t.handedOver} />
            <Row label="Cash variance" value={t.variance} />
            <Row label="Closing stock value" value={t.stockValue} />
            <Row label="Debts owed by customers" value={t.debtsClosing} />
          </Section>
          {data.url ? <Link href={data.url} style={styles.button}>Review the report</Link> : null}
        </Container>
      </Body>
    </Html>
  );
}
