// Narrative generation. Turns the deterministic scan analysis into the
// client-facing prose sections (quick findings, implementation plan, plain
// summary) via Claude. Falls back to a templated narrative when no API key is
// configured or the API call fails, so the tool always produces a full report.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.PRIVACY_SCAN_MODEL || 'claude-opus-4-8';

// JSON Schema the model must fill. Kept to strings / string-arrays / simple
// objects so it stays within structured-output constraints.
const NARRATIVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    executiveSummary: {
      type: 'string',
      description: 'One or two sentences summarizing the privacy posture and headline risk.',
    },
    quickFindings: {
      type: 'array',
      description: 'Bullet observations confirming what was seen on the live site.',
      items: { type: 'string' },
    },
    implementationSteps: {
      type: 'array',
      description: 'Ordered, client-facing remediation steps.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['title', 'detail'],
      },
    },
    clientFacingSummary: {
      type: 'string',
      description: 'A plain-English paragraph a non-technical client can read.',
    },
  },
  required: ['executiveSummary', 'quickFindings', 'implementationSteps', 'clientFacingSummary'],
};

/** Compact, model-friendly view of the scan for the prompt. */
function factsFor(company, analysis) {
  const vendors = analysis.detectedVendors.map((v) => ({
    name: v.name,
    category: v.category,
    firedBeforeConsent: analysis.preConsentVendors.some((p) => p.id === v.id),
  }));
  return {
    company,
    website: analysis.baseHost,
    riskLevel: analysis.risk.level,
    riskScore: analysis.risk.score,
    trackingBeforeConsent: analysis.trackingBeforeConsent,
    consentBannerDetected: analysis.consent.present,
    thirdPartyDomainCount: analysis.counts.thirdPartyDomains,
    trackingCookieCount: analysis.counts.trackingCookies,
    cookieCount: analysis.counts.cookies,
    hasPrivacyPolicy: analysis.hasPrivacyPolicy,
    hasCookiePolicy: analysis.hasCookiePolicy,
    vendors,
    riskFactors: analysis.risk.factors.map((f) => f.label),
    consentInteraction: analysis.consentDelta
      ? {
          acceptButtonClicked: analysis.consentDelta.accepted,
          newTrackersLoadedAfterAccepting: analysis.consentDelta.newVendors,
          newThirdPartyDomainsAfterAccepting: analysis.consentDelta.newThirdPartyDomains.length,
        }
      : null,
  };
}

const SYSTEM_PROMPT = `You are a privacy consultant at efelle creative, a Seattle web design agency, writing a client-facing website privacy review.

You are given the structured results of an automated privacy scan of a single homepage, loaded in a clean browser session with no prior consent. Write three things, grounded ONLY in the scan data provided — never invent findings, cookie names, vendors, dates, or legal conclusions that aren't supported by the data.

Voice: clear, direct, professional, and reassuring. You advise the client; you do not scold them. Do not give legal advice or opine on the legal merits of any claim — you describe technical privacy posture and recommended fixes only.

Sections:
1. executiveSummary — 1-2 sentences: the headline privacy posture and the single most important issue.
2. quickFindings — 4-7 short bullets confirming what the scan observed on the live site (trackers firing before consent, specific named vendors, cookies set on load, whether a consent banner and privacy/cookie policy were found). Reference the actual vendors and counts from the data.
3. implementationSteps — an ordered remediation plan (4-6 steps), each a {title, detail}. Lead with a consent management platform if trackers fire before consent. Be specific to what the scan found (e.g. name the vendors to gate, mention video embeds if YouTube/Vimeo were detected).
4. clientFacingSummary — one plain-English paragraph a non-technical stakeholder can read, explaining what was found and what fixing it involves, without jargon. Note that this improves posture going forward and is not a legal determination.

Return only the structured JSON.`;

/**
 * Generate narrative sections. Returns { source: 'ai'|'fallback', ...sections }.
 */
export async function generateNarrative(company, analysis) {
  const facts = factsFor(company, analysis);

  if (!process.env.ANTHROPIC_API_KEY) {
    return { source: 'fallback', ...fallbackNarrative(company, analysis) };
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      output_config: {
        format: {
          type: 'json_schema',
          name: 'privacy_narrative',
          schema: NARRATIVE_SCHEMA,
        },
      },
      messages: [
        {
          role: 'user',
          content:
            `Scan results (JSON):\n${JSON.stringify(facts, null, 2)}\n\n` +
            `Write the review for ${company} (${facts.website}).`,
        },
      ],
    });

    const text = response.content.find((b) => b.type === 'text')?.text || '';
    const parsed = JSON.parse(text);
    return { source: 'ai', model: MODEL, ...parsed };
  } catch (err) {
    return {
      source: 'fallback',
      error: err.message,
      ...fallbackNarrative(company, analysis),
    };
  }
}

// --- Deterministic fallback -------------------------------------------------

function fallbackNarrative(company, analysis) {
  const vendorNames = analysis.detectedVendors.map((v) => v.name);
  const preConsentNames = analysis.preConsentVendors.map((v) => v.name);

  const executiveSummary = analysis.trackingBeforeConsent
    ? `The scan of ${analysis.baseHost} found ${analysis.preConsentVendors.length} consent-requiring tracker(s) loading before any consent was given — the primary driver of the ${analysis.risk.level.toLowerCase()} risk rating.`
    : `The scan of ${analysis.baseHost} did not observe consent-requiring trackers firing before consent on the homepage. Overall risk is rated ${analysis.risk.level.toLowerCase()}.`;

  const quickFindings = [];
  if (preConsentNames.length) {
    quickFindings.push(
      `The following load before any consent interaction: ${preConsentNames.join(', ')}.`,
    );
  }
  quickFindings.push(
    `The homepage contacted ${analysis.counts.thirdPartyDomains} distinct third-party domain(s) on load.`,
  );
  if (analysis.counts.trackingCookies > 0) {
    quickFindings.push(
      `${analysis.counts.trackingCookies} known tracking cookie(s) were set before consent.`,
    );
  }
  quickFindings.push(
    analysis.consent.present
      ? 'A cookie consent banner was detected on the homepage.'
      : 'No cookie consent banner was detected in the crawlable homepage content.',
  );
  quickFindings.push(
    analysis.hasPrivacyPolicy
      ? 'A Privacy Policy link is present.'
      : 'No Privacy Policy link was found on the homepage.',
  );
  quickFindings.push(
    analysis.hasCookiePolicy
      ? 'A Cookie Policy link is present.'
      : 'No dedicated Cookie Policy link was found.',
  );

  const implementationSteps = [];
  if (analysis.trackingBeforeConsent || !analysis.consent.present) {
    implementationSteps.push({
      title: 'Install a consent management platform',
      detail:
        'Deploy a CMP (e.g. CookieYes or Termly) configured for prior consent, not just notice, so non-essential technologies are blocked until the visitor opts in.',
    });
    implementationSteps.push({
      title: 'Block non-essential scripts until opt-in',
      detail: `Gate analytics, marketing pixels, session replay, and social/video embeds${
        vendorNames.length ? ` (including ${vendorNames.join(', ')})` : ''
      } behind consent.`,
    });
  }
  if (analysis.detectedVendors.some((v) => v.category.includes('Video'))) {
    implementationSteps.push({
      title: 'Replace direct video embeds',
      detail:
        'Use privacy-safe placeholders that load YouTube/Vimeo only after the user clicks to accept.',
    });
  }
  implementationSteps.push({
    title: analysis.hasPrivacyPolicy ? 'Tighten the Privacy Policy' : 'Publish a Privacy Policy',
    detail:
      'Ensure the policy covers third-party tracking, consent choices, California users, and "Do Not Sell/Share" language.',
  });
  if (!analysis.hasCookiePolicy) {
    implementationSteps.push({
      title: 'Add a Cookie Policy',
      detail: 'List the actual cookies and vendors surfaced by this scan, with purpose and lifespan.',
    });
  }
  implementationSteps.push({
    title: 'Document the fix',
    detail: 'Save before/after screenshots, scan results, and a short implementation memo.',
  });

  const clientFacingSummary =
    `We reviewed ${company}'s website at a high level using an automated scan. ` +
    (analysis.trackingBeforeConsent
      ? 'The scan found third-party technologies loading before a visitor gives consent. '
      : 'The scan focused on third-party technologies and consent behavior on the homepage. ') +
    'We recommend implementing a consent management platform, blocking non-essential third-party scripts until consent is given' +
    (analysis.detectedVendors.some((v) => v.category.includes('Video'))
      ? ', replacing direct video embeds with consent-based placeholders,'
      : '') +
    ' and updating the Privacy/Cookie Policy. This improves the site’s privacy posture going forward and is not a legal determination.';

  return { executiveSummary, quickFindings, implementationSteps, clientFacingSummary };
}
