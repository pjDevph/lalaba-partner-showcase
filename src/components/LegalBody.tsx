// Shared Terms & Conditions / Privacy Policy text — single source of truth.
// Rendered by the Register agreement modal (src/screens/register/legalContent.tsx)
// and the read-only Settings viewer (src/screens/settings/LegalScreen.tsx).
// Update the wording HERE only, so the two surfaces never drift apart.
import React from "react";
import { Text, StyleSheet, View } from "react-native";
import { C } from "../theme/tokens";

export type LegalKind = "terms" | "privacy";

export function LegalBody({ kind }: Readonly<{ kind: LegalKind }>) {
  if (kind === "terms") {
    return (
      <View className="p-8">
        <Text style={s.meta}>Version 1.0 — Effective June 2026</Text>
        <Text style={s.body}>
          These Terms and Conditions govern your use of the Lalaba
          Partner app and the Lalaba merchant platform. By registering,
          you confirm that you have read, understood, and agreed to be
          bound by these terms.
        </Text>

        <Text style={s.section}>1. The Lalaba Platform</Text>
        <Text style={s.body}>
          Lalaba is a business management platform for laundry shop
          owners and operators. It provides tools for managing a
          Point-of-Sale (POS) terminal, customer orders (walk-in,
          pickup, and delivery), service pricing, inventory, staff
          accounts, washer assignments, daily costing, branch
          management, and sales analytics.{"\n\n"}
          Use of the platform requires an active merchant account
          and at least one registered branch.
        </Text>

        <Text style={s.section}>2. Merchant Responsibilities</Text>
        <Text style={s.body}>
          As a merchant, you are responsible for:{"\n\n"}
          • Maintaining accurate shop name, address, and contact
          information at all times.{"\n"}
          • Setting correct pricing for all services (wash & fold,
          dry cleaning, ironing/press, self-service, pickup, delivery).{"\n"}
          • Fulfilling all customer orders accepted through the
          platform promptly and as described.{"\n"}
          • Ensuring your staff use the platform only for authorized
          business purposes.{"\n"}
          • Keeping your login credentials confidential. You are
          responsible for all activity under your account.
        </Text>

        <Text style={s.section}>3. Orders & POS</Text>
        <Text style={s.body}>
          Orders created via the Lalaba POS or received through the
          customer-facing app are binding service commitments. Merchants
          must not cancel or ignore accepted orders without valid reason.
          Repeated failure to fulfil orders may result in account
          review or suspension.
        </Text>

        <Text style={s.section}>4. Staff & Washer Accounts</Text>
        <Text style={s.body}>
          You may add staff members and assign washer (gig worker)
          accounts under your merchant profile. You are responsible for
          the actions of all accounts linked to your shop. Lalaba is
          not liable for disputes between merchants and their staff
          or washers.
        </Text>

        <Text style={s.section}>5. Payments & Fees</Text>
        <Text style={s.body}>
          Payments collected from customers through the platform are
          your responsibility to manage. Lalaba may charge platform
          service fees, which will be communicated to you in advance.
          Payment gateway fees, applicable taxes on your business
          income, and any charges related to refunds or disputes are
          your own obligation. Lalaba is not liable for payment
          disputes between you and your customers.
        </Text>

        <Text style={s.section}>6. Refunds, Cancellations & Disputes</Text>
        <Text style={s.body}>
          Merchants are responsible for handling customer complaints,
          service defects, lost or damaged laundry claims, incorrect
          pricing, cancellations, and refunds caused by merchant error
          or failure to fulfil an accepted order.{"\n\n"}
          Lalaba may assist in dispute review but is not the direct
          laundry service provider and is not liable for service
          outcomes between merchants and their customers. Consumer
          rights under the Consumer Act (RA 7394) remain in effect.
        </Text>

        <Text style={s.section}>7. Prohibited Use</Text>
        <Text style={s.body}>
          You may not use the Lalaba platform to:{"\n\n"}
          • Misrepresent your business, pricing, or services.{"\n"}
          • Process fraudulent or fictitious transactions.{"\n"}
          • Collect or store customer data outside of what the
          platform provides.{"\n"}
          • Circumvent platform billing or fee structures.{"\n"}
          • Conduct any activity that violates Philippine law,
          including the Consumer Act (RA 7394) and the Data Privacy
          Act (RA 10173).
        </Text>

        <Text style={s.section}>8. Intellectual Property</Text>
        <Text style={s.body}>
          The Lalaba platform, logo, and all associated software are
          the intellectual property of Lalaba. You are granted a
          limited, non-exclusive, non-transferable licence to use the
          app solely for managing your laundry business. You may not
          copy, reverse-engineer, or redistribute any part of the
          platform.
        </Text>

        <Text style={s.section}>9. Limitation of Liability</Text>
        <Text style={s.body}>
          Lalaba provides the platform on an &quot;as-is&quot; basis. We do not
          guarantee uninterrupted service. To the extent permitted by
          Philippine law, Lalaba is not liable for lost profits, lost
          data, or indirect damages arising from platform use or
          downtime.{"\n\n"}
          Nothing in these Terms limits liability for fraud, willful
          misconduct, gross negligence, data privacy violations, or
          any liability that cannot be excluded under applicable law.
        </Text>

        <Text style={s.section}>10. Account Suspension & Termination</Text>
        <Text style={s.body}>
          Lalaba may immediately suspend accounts for fraud, illegal
          activity, security risk, payment abuse, or serious customer
          harm. For less urgent violations, Lalaba may provide notice
          and an opportunity to correct the issue before suspension.
          {"\n\n"}
          Lalaba also reserves the right to suspend or terminate
          accounts that remain inactive for more than 12 consecutive
          months. Suspension does not remove your responsibility for
          pending orders, refunds, unpaid fees, or customer
          obligations. You may close your account at any time by
          contacting support@lalaba.ph.
        </Text>

        <Text style={s.section}>11. Governing Law & Dispute Resolution</Text>
        <Text style={s.body}>
          These Terms are governed by the laws of the Republic of the
          Philippines. Any dispute shall first be resolved through
          good-faith negotiation between the parties. If unresolved
          within 30 days, the dispute shall be brought before the
          proper courts of the Philippines, unless applicable law
          requires another venue.
        </Text>

        <Text style={s.section}>12. Changes to These Terms</Text>
        <Text style={s.body}>
          Lalaba may update these Terms and Conditions as the platform
          evolves. Material changes will be notified via the app or
          email at least 15 days in advance. Continued use of the
          platform after the effective date constitutes acceptance of
          the updated terms.{"\n\n"}
          For questions, contact support@lalaba.ph.
        </Text>

        <Text style={s.updated}>Last updated: June 2026</Text>
      </View>
    );
  }

  return (
    <View className="p-8">
      <Text style={s.meta}>Version 1.0 — Effective June 2026</Text>
      <Text style={s.body}>
        Lalaba (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is committed to protecting your
        personal data in accordance with Republic Act No. 10173, the
        Data Privacy Act of 2012 (DPA), and its Implementing Rules and
        Regulations. This policy explains what data we collect, why we
        collect it, and the rights you have as a data subject.
      </Text>

      <Text style={s.section}>1. Personal Information Controller</Text>
      <Text style={s.body}>
        Lalaba operates the Lalaba Partner app and acts as the
        Personal Information Controller (PIC) for merchant account,
        registration, platform usage, and support data.{"\n\n"}
        For customer laundry orders entered or processed by merchants,
        the merchant may act as the primary service provider and
        controller of customer relationship data, while Lalaba
        processes such data solely to operate the platform, support
        transactions, ensure security, and comply with legal
        obligations.{"\n\n"}
        For privacy concerns, contact our Data Protection Officer at
        privacy@lalaba.ph.
      </Text>

      <Text style={s.section}>2. Data We Collect</Text>
      <Text style={s.body}>
        <Text style={s.bold}>Account information:{"\n"}</Text>
        Full name, email address, and mobile number. We do not store
        your password in plain text — authentication credentials are
        handled through Firebase Authentication and its related
        security controls.{"\n\n"}
        <Text style={s.bold}>Business information:{"\n"}</Text>
        Shop name, business address, GPS coordinates (only when you
        use location-based features such as setting your shop location
        or branch mapping), service types offered, and business mobile
        number. We do not collect continuous background location.{"\n\n"}
        <Text style={s.bold}>Operational data:{"\n"}</Text>
        Orders, transactions, POS records, inventory, daily costing
        entries, staff profiles, and branch details you create within
        the app.{"\n\n"}
        <Text style={s.bold}>Usage data:{"\n"}</Text>
        App interactions and error logs used solely for platform
        stability and improvement.
      </Text>

      <Text style={s.section}>3. Legal Basis for Processing</Text>
      <Text style={s.body}>
        We process your personal data on the following bases under the
        DPA:{"\n\n"}
        • <Text style={s.bold}>Consent</Text> — your explicit
        agreement during registration.{"\n"}
        • <Text style={s.bold}>Contractual necessity</Text> —
        processing required to provide and operate your merchant
        account.{"\n"}
        • <Text style={s.bold}>Legitimate interests</Text> —
        platform security, fraud prevention, and service improvement,
        provided these do not override your rights.
      </Text>

      <Text style={s.section}>4. How We Use Your Data</Text>
      <Text style={s.body}>
        • Create and manage your merchant account{"\n"}
        • Process and fulfil customer orders{"\n"}
        • Display your business to customers placing orders{"\n"}
        • Send transaction confirmations and service notifications{"\n"}
        • Generate reports and analytics for your own business use{"\n"}
        • Comply with applicable Philippine laws and regulations{"\n"}
        • Improve platform features and fix technical issues{"\n\n"}
        We do not sell, rent, or trade your personal data to any third
        party for marketing purposes.
      </Text>

      <Text style={s.section}>5. Data Sharing</Text>
      <Text style={s.body}>
        <Text style={s.bold}>With customers:</Text> Your shop
        name, address, and contact number are shared with customers who
        place orders through the platform.{"\n\n"}
        <Text style={s.bold}>Service providers:</Text> We use
        Firebase (Google LLC) for authentication and push notifications,
        subject to Google&apos;s Data Processing Terms. Some data may be
        processed or stored by trusted service providers in accordance
        with their applicable security terms. Where possible, Lalaba
        configures storage locations and security controls appropriate
        for Philippine users and applicable law.{"\n\n"}
        <Text style={s.bold}>Payment providers:</Text> We may
        share transaction details and payment references with payment
        gateways, banks, or e-wallet providers as necessary to process
        payments, refunds, and comply with financial regulations.{"\n\n"}
        <Text style={s.bold}>Legal disclosure:</Text> We may
        disclose personal data if required by Philippine law, court
        order, or a lawful request from government authorities.
      </Text>

      <Text style={s.section}>6. Data Storage & Security</Text>
      <Text style={s.body}>
        We apply access controls, encryption in transit (HTTPS/TLS),
        and regular security reviews to safeguard your information.
        Authentication is handled by Firebase Authentication. Business
        and transaction data is stored on secured servers. We do not
        store passwords in plain text.{"\n\n"}
        In the event of a personal data breach requiring notification,
        Lalaba will assess the incident and notify the National Privacy
        Commission and affected data subjects within the timeframe
        required by law.
      </Text>

      <Text style={s.section}>7. Data Retention</Text>
      <Text style={s.body}>
        We retain your account and business data for as long as your
        account is active and for up to 5 years after account closure
        to comply with tax and legal obligations. Operational records
        (orders, costing, transactions) are retained for 3 years.
        You may request earlier deletion subject to legal hold
        requirements.
      </Text>

      <Text style={s.section}>8. Your Rights under RA 10173</Text>
      <Text style={s.body}>
        As a data subject, you have the right to:{"\n\n"}
        • <Text style={s.bold}>Access</Text> — request a copy of
        the personal data we hold about you.{"\n"}
        • <Text style={s.bold}>Rectification</Text> — correct
        inaccurate or incomplete personal data.{"\n"}
        • <Text style={s.bold}>Erasure</Text> — request deletion
        of your data, subject to legal retention requirements.{"\n"}
        • <Text style={s.bold}>Object</Text> — object to
        processing based on legitimate interests.{"\n"}
        • <Text style={s.bold}>Data portability</Text> — receive
        your data in a structured, machine-readable format.{"\n"}
        • <Text style={s.bold}>Withdraw consent</Text> — at any
        time, without affecting the lawfulness of prior processing.{"\n\n"}
        To exercise any of these rights, email privacy@lalaba.ph. We
        will respond within 15 business days.
      </Text>

      <Text style={s.section}>9. Children&apos;s Privacy</Text>
      <Text style={s.body}>
        The Lalaba Partner app is intended for business use by adults
        (18 years and older). We do not knowingly collect personal data
        from minors. If you believe a minor has provided us data,
        contact privacy@lalaba.ph immediately.
      </Text>

      <Text style={s.section}>10. Changes to This Policy</Text>
      <Text style={s.body}>
        We may update this Privacy Policy as our services evolve or as
        required by law. Material changes will be notified via the app
        or email at least 15 days before taking effect. Continued use
        of the app after that date constitutes acceptance of the
        updated policy.
      </Text>

      <Text style={s.section}>11. Contact & Complaints</Text>
      <Text style={s.body}>
        For any privacy concerns or to exercise your rights:{"\n"}
        Email: privacy@lalaba.ph{"\n"}
        Subject: &quot;Data Privacy Request&quot;{"\n\n"}
        If you believe your data privacy rights have been violated, you
        may file a complaint with the National Privacy Commission
        (NPC) at www.privacy.gov.ph.
      </Text>

      <Text style={s.updated}>Last updated: June 2026</Text>
    </View>
  );
}

const s = StyleSheet.create({
  meta:    { fontSize: 11, color: C.gray400, marginBottom: 16 },
  section: { fontSize: 14, fontWeight: "700", color: C.gray900, marginTop: 20, marginBottom: 6 },
  body:    { fontSize: 13, color: C.gray600, lineHeight: 21 },
  bold:    { fontWeight: "700", color: C.gray800 },
  updated: { fontSize: 11, color: C.gray400, marginTop: 32, textAlign: "center" },
});
