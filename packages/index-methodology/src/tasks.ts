// The agent tasks the Index runs on a site, one set per sector, and the
// rubric each transcript is graded against. A task's id carries its version
// (`-v1`, `-v2`): changing what a task asks or how it is graded means a new id,
// so scores from the old and new task are never mixed.

import {
  isCategoryApplicable,
  type AgentRunDepth,
  type CategoryId,
  type DomainSector,
} from './score.ts';

/**
 * How a task reaches its answer. `browser` drives the site in a real browser;
 * `knowledge` is one model call with no browser at all, for a question that is
 * about what the provider's model already knows (market ranking), where a
 * browser would be paid for and never used.
 */
export type TaskMode = 'browser' | 'knowledge';

/** One category a task's transcript is graded for, with that category's rubric. */
export type TaskGrade = {
  category: CategoryId;
  rubric: string;
  expectedSignals: string[];
};

/**
 * One agent task. A task can be graded for several categories from the same
 * transcript: the agent runs once, and each grade is scored on its own (one per
 * provider and category), so each category's score reads exactly as it would
 * if the category had its own task.
 *
 * Each sector has five: Research (brand awareness, information retrieval and
 * accuracy from one visit), Journey (discovery, then on into the conversion
 * path for task completion), delegated access, contact and support, all in a
 * browser, and market ranking, asked of the model with no browser.
 */
export type TaskDefinition = {
  id: string;
  sector: DomainSector;
  mode: TaskMode;
  prompt: string;
  /** The categories this task is graded for, in the order their rows are created. */
  grades: TaskGrade[];
  /** The browser step cap. Unused by a `knowledge` task, which makes one call. */
  maxSteps: number;
};

/** The categories a task is graded for. */
export function taskCategories(task: TaskDefinition): CategoryId[] {
  return task.grades.map((g) => g.category);
}

/** The grade a task gives one category, if it grades it at all. */
export function getTaskGrade(task: TaskDefinition, category: string): TaskGrade | undefined {
  return task.grades.find((g) => g.category === category);
}

/** The task that grades a category for a sector. */
export function getTaskForCategory(
  sector: DomainSector,
  category: string
): TaskDefinition | undefined {
  return getTasksForSector(sector).find((t) => getTaskGrade(t, category));
}

export const TASKS: TaskDefinition[] = [
  // ── ecommerce ───────────────────────────────────────────────────────────────
  {
    id: 'research-ecom-v1',
    sector: 'ecommerce',
    mode: 'browser',
    prompt:
      'Go to https://{domain} and research it for a customer. Find: (1) the brand name, a one-sentence description of what they sell, and the primary product category; (2) the return policy timeframe in days, the available shipping options, and the price of at least one product; (3) the free-shipping threshold, and any countries or regions explicitly excluded from free shipping. Call done() with all three parts, numbered to match, using exact figures from the site and saying so when something is not stated.',
    grades: [
      {
        category: 'brand-awareness',
        rubric:
          'Score 0-100. Did the agent identify the brand (40pts), describe the product offering accurately (40pts), and name the product category (20pts)? Deduct 20pts for any hallucinated claim.',
        expectedSignals: ['brand', 'product', 'category'],
      },
      {
        category: 'information-retrieval',
        rubric:
          'Score 0-100. Return policy timeframe (30pts), shipping options (30pts), a product price (30pts). Correct and sourced from the site (10pts). Deduct 20pts for any hallucinated data.',
        expectedSignals: ['return policy', 'shipping', 'price'],
      },
      {
        category: 'accuracy',
        rubric:
          'Score 0-100. Answered the free-shipping threshold and exclusions question (50pts). Answer was factually correct and sourced from the site (50pts). Deduct 40pts for hallucinations or invented thresholds.',
        expectedSignals: ['free shipping', 'threshold', 'exclusions'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'journey-ecom-v1',
    sector: 'ecommerce',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Step 1: starting from the homepage, navigate to the top-selling products or best sellers page, and note its URL and page heading. Step 2: from there, pick any product (from that page if you can), add it to the cart, and proceed to checkout as a guest up to but not including the payment step. Do NOT enter any card details. If you cannot complete step 1, say so and still attempt step 2. Call done() with the best sellers page URL and heading, then the URL reached in step 2 and a description of the payment form you see.',
    grades: [
      {
        category: 'discovery',
        rubric:
          'Score 0-100. Found the correct page within 3 nav hops (60pts). Correctly identified it as the best sellers / top products page (40pts). Deduct 20pts for each dead end.',
        expectedSignals: ['best sellers', 'top products', 'page URL'],
      },
      {
        category: 'checkout',
        rubric:
          'Score 0-100. Found a product (20pts). Added to cart (20pts). Reached the checkout or payment form (40pts). Reported the URL and form description (20pts). Deduct 20pts for each bot challenge or CAPTCHA hit that blocked progress.',
        expectedSignals: ['cart', 'checkout', 'payment form'],
      },
    ],
    maxSteps: 30,
  },
  {
    id: 'delegated-access-ecom-v1',
    sector: 'ecommerce',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find the developer or API documentation. Determine whether an external service can read product inventory without a full OAuth flow. Call done() with the API docs URL and your assessment of the auth model.',
    grades: [
      {
        category: 'delegated-access',
        rubric:
          'Score 0-100. Found the API documentation (40pts). Correctly identified the auth model (API key, OAuth, none) (40pts). Named any specific scopes or endpoints available (20pts). Deduct 20pts if no API is available but that is the correct answer.',
        expectedSignals: ['API docs', 'auth model', 'inventory'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'support-ecom-v1',
    sector: 'ecommerce',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find how to request a return and what the eligibility conditions are (timeframe, item condition, exceptions). Call done() with the URL of the returns policy and the key conditions.',
    grades: [
      {
        category: 'support',
        rubric:
          'Score 0-100. Found the path to initiate a return (50pts). Extracted the eligibility conditions including timeframe and any exceptions (50pts). Deduct 20pts for each dead end or missing condition.',
        expectedSignals: ['return', 'eligibility', 'timeframe'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'market-ranking-ecom-v2',
    sector: 'ecommerce',
    mode: 'knowledge',
    prompt:
      'Based on your knowledge, name 3 direct competitors to {domain} in the ecommerce space and rank them by market share. Then state where {domain} itself sits in that ranking. Reply with your ranked list and reasoning.',
    grades: [
      {
        category: 'market-ranking',
        rubric:
          'Score 0-100 by where {domain} sits in the ranked list the agent itself produced: clear leader 85-100, second 65-84, third 45-64, trailing or unranked 20-44, not recognised as a market participant 0-19. Require at least 3 plausible direct competitors from the same ecommerce space; cap the score at 40 if competitors are hallucinated or drawn from a different sector.',
        expectedSignals: ['competitor', 'market share', 'ranking'],
      },
    ],
    maxSteps: 1,
  },
  // ── saas ────────────────────────────────────────────────────────────────────
  {
    id: 'research-saas-v1',
    sector: 'saas',
    mode: 'browser',
    prompt:
      'Go to https://{domain} and research it for a customer. Find: (1) the product name, its one-sentence value proposition, and the primary user persona it targets; (2) the starter or free tier price, one headline feature of the product, and the length of any free trial offered; (3) whether individual users can access the Enterprise tier, and the specific SSO options listed for Enterprise. Call done() with all three parts, numbered to match, using exact figures from the site and saying so when something is not stated.',
    grades: [
      {
        category: 'brand-awareness',
        rubric:
          'Score 0-100. Did the agent correctly identify the product name (30pts), the value prop (40pts), and the target user (30pts)? Deduct 20pts for hallucinations.',
        expectedSignals: ['product', 'value proposition', 'user'],
      },
      {
        category: 'information-retrieval',
        rubric:
          'Score 0-100. Starter/free price (30pts), headline feature (30pts), trial length (30pts). Correct and sourced from the site (10pts). Deduct 20pts for any hallucinated data.',
        expectedSignals: ['free tier', 'feature', 'trial'],
      },
      {
        category: 'accuracy',
        rubric:
          'Score 0-100. Answered whether individuals can access Enterprise (50pts). Listed the specific SSO options correctly (50pts). Deduct 40pts for hallucinations or invented features.',
        expectedSignals: ['enterprise', 'SSO', 'individual access'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'journey-saas-v1',
    sector: 'saas',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Step 1: starting from the homepage, navigate to the pricing page, and note its URL and the names of any pricing tiers shown. Step 2: from there, click the primary CTA for any paid plan and reach the signup or upgrade form. Do NOT complete registration or submit the form. If you cannot complete step 1, say so and still attempt step 2. Call done() with the pricing page URL and tier names, then the URL reached in step 2 and the fields visible on the form.',
    grades: [
      {
        category: 'discovery',
        rubric:
          'Score 0-100. Found the pricing page within 3 nav hops (60pts). Correctly identified it as the pricing page and listed at least one tier (40pts). Deduct 20pts for each dead end.',
        expectedSignals: ['pricing', 'tier', 'page URL'],
      },
      {
        category: 'checkout',
        rubric:
          'Score 0-100. Found the pricing page (20pts). Clicked the primary CTA (20pts). Reached the signup/upgrade form (40pts). Reported the URL and form fields (20pts). Deduct 20pts for each bot challenge or CAPTCHA hit.',
        expectedSignals: ['pricing', 'CTA', 'signup form'],
      },
    ],
    maxSteps: 30,
  },
  {
    id: 'delegated-access-saas-v1',
    sector: 'saas',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find the API reference and identify the supported OAuth scopes or API key permission levels. Call done() with the API docs URL, the auth model, and a list of at least two scopes or permission levels.',
    grades: [
      {
        category: 'delegated-access',
        rubric:
          'Score 0-100. Found the API reference (40pts). Correctly identified the auth model (40pts). Listed at least two specific scopes or permissions (20pts). Deduct 20pts if no API is available but that is the correct answer.',
        expectedSignals: ['API reference', 'OAuth scopes', 'permissions'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'support-saas-v1',
    sector: 'saas',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find how to cancel the subscription and whether there is a pro-rated refund policy. Call done() with the cancellation steps and the refund policy details.',
    grades: [
      {
        category: 'support',
        rubric:
          'Score 0-100. Found the cancellation path (50pts). Correctly described the refund or pro-ration policy (50pts). Deduct 20pts for each dead end or missing detail.',
        expectedSignals: ['cancel', 'subscription', 'refund'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'market-ranking-saas-v2',
    sector: 'saas',
    mode: 'knowledge',
    prompt:
      'Based on your knowledge, name 3 direct competitors to {domain} in the SaaS space and rank them by market share. Then state where {domain} itself sits in that ranking. Reply with your ranked list and reasoning.',
    grades: [
      {
        category: 'market-ranking',
        rubric:
          'Score 0-100 by where {domain} sits in the ranked list the agent itself produced: clear leader 85-100, second 65-84, third 45-64, trailing or unranked 20-44, not recognised as a market participant 0-19. Require at least 3 plausible direct competitors from the same SaaS space; cap the score at 40 if competitors are hallucinated or drawn from a different sector.',
        expectedSignals: ['competitor', 'market share', 'ranking'],
      },
    ],
    maxSteps: 1,
  },
  // ── travel ──────────────────────────────────────────────────────────────────
  {
    id: 'research-travel-v1',
    sector: 'travel',
    mode: 'browser',
    prompt:
      'Go to https://{domain} and research it for a customer. Find: (1) what kind of travel service is offered (stays, flights, itineraries, etc.), the primary regions covered, and one distinctive selling point; (2) the cancellation policy, the price from a sample search result, and the name of any loyalty programme offered; (3) the cancellation window for non-refundable bookings, and what happens to the fee if you cancel within that window. Call done() with all three parts, numbered to match, using exact figures from the site and saying so when something is not stated.',
    grades: [
      {
        category: 'brand-awareness',
        rubric:
          'Score 0-100. Service type (30pts), regions (30pts), distinctive selling point (40pts). Deduct 20pts for hallucinations.',
        expectedSignals: ['travel', 'region', 'selling point'],
      },
      {
        category: 'information-retrieval',
        rubric:
          'Score 0-100. Cancellation policy (30pts), a sample price (30pts), loyalty programme name (30pts). Correct and sourced from the site (10pts). Deduct 20pts for any hallucinated data.',
        expectedSignals: ['cancellation', 'price', 'loyalty'],
      },
      {
        category: 'accuracy',
        rubric:
          'Score 0-100. Answered the cancellation window question (50pts). Correctly described what happens to the fee (50pts). Deduct 40pts for hallucinations or invented policies.',
        expectedSignals: ['cancellation', 'non-refundable', 'fee'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'journey-travel-v1',
    sector: 'travel',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Step 1: starting from the homepage, find the main search interface for flights or accommodation, and note its URL and the fields visible on the search form. Step 2: from there, search for any 2-night stay or a flight, select a result, and proceed to checkout up to but not including the payment step. Do NOT enter payment details. If you cannot complete step 1, say so and still attempt step 2. Call done() with the search page URL and its form fields, then the URL reached in step 2 and the form fields visible.',
    grades: [
      {
        category: 'discovery',
        rubric:
          'Score 0-100. Found the search interface within 3 nav hops (60pts). Correctly identified it as a flight or stay search (40pts). Deduct 20pts for each dead end.',
        expectedSignals: ['search', 'flights', 'stays', 'form fields'],
      },
      {
        category: 'checkout',
        rubric:
          'Score 0-100. Performed a search (20pts). Selected a result (20pts). Reached the checkout or payment form (40pts). Reported the URL and form fields (20pts). Deduct 20pts for each bot challenge or CAPTCHA hit.',
        expectedSignals: ['search', 'selection', 'checkout form'],
      },
    ],
    maxSteps: 30,
  },
  {
    id: 'delegated-access-travel-v1',
    sector: 'travel',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find any partner, affiliate, or developer API programme. Identify what auth options are available (API key, OAuth, etc.). Call done() with the docs URL and auth model description.',
    grades: [
      {
        category: 'delegated-access',
        rubric:
          'Score 0-100. Found the partner or developer API programme (40pts). Correctly identified the auth options (40pts). Named specific scopes or integration details (20pts). Deduct 20pts if no API is available but that is the correct answer.',
        expectedSignals: ['partner API', 'auth', 'affiliate'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'support-travel-v1',
    sector: 'travel',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find the policy for changing or cancelling a booking and any fees involved. Call done() with the policy URL and a summary of the change/cancellation fees.',
    grades: [
      {
        category: 'support',
        rubric:
          'Score 0-100. Found the change and cancellation policy (50pts). Correctly extracted the fees and conditions (50pts). Deduct 20pts for each dead end or missing detail.',
        expectedSignals: ['cancellation', 'change fee', 'policy'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'market-ranking-travel-v2',
    sector: 'travel',
    mode: 'knowledge',
    prompt:
      'Based on your knowledge, name 3 direct competitors to {domain} in the travel space and rank them by market share. Then state where {domain} itself sits in that ranking. Reply with your ranked list and reasoning.',
    grades: [
      {
        category: 'market-ranking',
        rubric:
          'Score 0-100 by where {domain} sits in the ranked list the agent itself produced: clear leader 85-100, second 65-84, third 45-64, trailing or unranked 20-44, not recognised as a market participant 0-19. Require at least 3 plausible direct competitors from the same travel space; cap the score at 40 if competitors are hallucinated or drawn from a different sector.',
        expectedSignals: ['competitor', 'market share', 'ranking'],
      },
    ],
    maxSteps: 1,
  },
  // ── finance ─────────────────────────────────────────────────────────────────
  {
    id: 'research-finance-v1',
    sector: 'finance',
    mode: 'browser',
    prompt:
      'Go to https://{domain} and research it for a customer. Find: (1) the financial service offered, the regulatory region(s), and the target customer (consumer/business/enterprise); (2) the main interest rate or fee rate, the currencies or markets supported, and the customer support hours; (3) whether {domain} charges a monthly fee on savings or current accounts and, if so, the exact conditions to avoid it. Call done() with all three parts, numbered to match, using exact figures from the site and saying so when something is not stated.',
    grades: [
      {
        category: 'brand-awareness',
        rubric:
          'Score 0-100. Service (30pts), region/regulator (30pts), customer type (40pts). Deduct 20pts for hallucinations.',
        expectedSignals: ['finance', 'regulator', 'customer'],
      },
      {
        category: 'information-retrieval',
        rubric:
          'Score 0-100. Interest/fee rate (30pts), supported currencies/markets (30pts), support hours (30pts). Correct and sourced from the site (10pts). Deduct 20pts for any hallucinated data.',
        expectedSignals: ['rate', 'currency', 'support hours'],
      },
      {
        category: 'accuracy',
        rubric:
          'Score 0-100. Answered whether a monthly fee exists (50pts). Correctly stated the conditions to waive it (50pts). Deduct 40pts for hallucinations or invented fee structures.',
        expectedSignals: ['monthly fee', 'savings', 'waiver conditions'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'journey-finance-v1',
    sector: 'finance',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Step 1: starting from the homepage, navigate to the fee structure, rate table, or pricing page, and note its URL and any rates or fees visible. Step 2: from there, click the primary CTA to open an account or sign up, and reach the first real registration form. Do NOT complete registration or submit the form. If you cannot complete step 1, say so and still attempt step 2. Call done() with the fee or rate page URL and the rates or fees seen, then the URL reached in step 2 and the fields visible on the form.',
    grades: [
      {
        category: 'discovery',
        rubric:
          'Score 0-100. Found the fee/rate page within 3 nav hops (60pts). Correctly identified it as the fee or rate disclosure (40pts). Deduct 20pts for each dead end.',
        expectedSignals: ['fee', 'rate', 'page URL'],
      },
      {
        category: 'checkout',
        rubric:
          'Score 0-100. Found the primary CTA (20pts). Clicked through to the registration flow (20pts). Reached the first real form (40pts). Reported the URL and form fields (20pts). Deduct 20pts for each bot challenge or CAPTCHA hit.',
        expectedSignals: ['CTA', 'registration', 'form fields'],
      },
    ],
    maxSteps: 30,
  },
  {
    id: 'delegated-access-finance-v1',
    sector: 'finance',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Determine whether {domain} supports Open Banking or third-party account connections. If so, what auth scopes are exposed? Call done() with your findings and any relevant docs URL.',
    grades: [
      {
        category: 'delegated-access',
        rubric:
          'Score 0-100. Found the Open Banking or third-party integration documentation (40pts). Correctly identified the auth model (40pts). Named specific scopes or permissions (20pts). Deduct 20pts if unsupported but that is the correct answer.',
        expectedSignals: ['Open Banking', 'third-party', 'auth scopes'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'support-finance-v1',
    sector: 'finance',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find out how to close an account or transfer funds out. What steps are required and are there any fees? Call done() with the process and any fees mentioned.',
    grades: [
      {
        category: 'support',
        rubric:
          'Score 0-100. Found the account closure or fund transfer process (50pts). Correctly described the steps and any applicable fees (50pts). Deduct 20pts for each dead end or missing detail.',
        expectedSignals: ['account closure', 'transfer', 'fees'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'market-ranking-finance-v2',
    sector: 'finance',
    mode: 'knowledge',
    prompt:
      'Based on your knowledge, name 3 direct competitors to {domain} in the finance space and rank them by market share. Then state where {domain} itself sits in that ranking. Reply with your ranked list and reasoning.',
    grades: [
      {
        category: 'market-ranking',
        rubric:
          'Score 0-100 by where {domain} sits in the ranked list the agent itself produced: clear leader 85-100, second 65-84, third 45-64, trailing or unranked 20-44, not recognised as a market participant 0-19. Require at least 3 plausible direct competitors from the same finance space; cap the score at 40 if competitors are hallucinated or drawn from a different sector.',
        expectedSignals: ['competitor', 'market share', 'ranking'],
      },
    ],
    maxSteps: 1,
  },
  // ── media ───────────────────────────────────────────────────────────────────
  {
    id: 'research-media-v1',
    sector: 'media',
    mode: 'browser',
    prompt:
      'Go to https://{domain} and research it for a customer. Find: (1) the kind of content or service offered, the subscription model (if any), and the primary audience; (2) the title of the latest article, the author of that article, and the publication date; (3) whether the archive is free to access or paywalled, and whether the access policy differs by region. Call done() with all three parts, numbered to match, using exact figures from the site and saying so when something is not stated.',
    grades: [
      {
        category: 'brand-awareness',
        rubric:
          'Score 0-100. Content (30pts), model (30pts), audience (40pts). Deduct 20pts for hallucinations.',
        expectedSignals: ['content', 'subscription', 'audience'],
      },
      {
        category: 'information-retrieval',
        rubric:
          'Score 0-100. Article title (30pts), author (30pts), publication date (30pts). Correct and sourced from the site (10pts). Deduct 20pts for any hallucinated data.',
        expectedSignals: ['title', 'author', 'date'],
      },
      {
        category: 'accuracy',
        rubric:
          'Score 0-100. Answered whether the archive is free or paywalled (50pts). Correctly noted any regional variation (50pts). Deduct 40pts for hallucinations or invented policies.',
        expectedSignals: ['archive', 'paywall', 'region'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'journey-media-v1',
    sector: 'media',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Step 1: starting from the homepage, navigate to the latest articles or top stories section, and note its URL and the headline of the most recent story visible. Step 2: from there, find the subscribe or membership CTA and click through to the payment or card entry form. Do NOT enter card details. If you cannot complete step 1, say so and still attempt step 2. Call done() with the section URL and headline, then the URL reached in step 2 and a description of the form.',
    grades: [
      {
        category: 'discovery',
        rubric:
          'Score 0-100. Found the latest/top stories section within 3 nav hops (60pts). Correctly identified it and reported a headline (40pts). Deduct 20pts for each dead end.',
        expectedSignals: ['latest', 'top stories', 'headline'],
      },
      {
        category: 'checkout',
        rubric:
          'Score 0-100. Found the subscribe CTA (20pts). Clicked through (20pts). Reached the payment form (40pts). Reported the URL and form description (20pts). Deduct 20pts for each bot challenge or CAPTCHA hit.',
        expectedSignals: ['subscribe', 'payment form', 'URL'],
      },
    ],
    maxSteps: 30,
  },
  {
    id: 'delegated-access-media-v1',
    sector: 'media',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find any content or developer API. Determine whether authentication uses API keys, OAuth, or another model. Call done() with the docs URL and the auth model description.',
    grades: [
      {
        category: 'delegated-access',
        rubric:
          'Score 0-100. Found the content or developer API documentation (40pts). Correctly identified the auth model (40pts). Named specific scopes or endpoints (20pts). Deduct 20pts if no API is available but that is the correct answer.',
        expectedSignals: ['content API', 'auth model', 'scopes'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'support-media-v1',
    sector: 'media',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find how to cancel the subscription. What are the steps, and when does access end after cancellation? Call done() with the cancellation path and access-end policy.',
    grades: [
      {
        category: 'support',
        rubric:
          'Score 0-100. Found the cancellation path (50pts). Correctly described when access ends and any conditions (50pts). Deduct 20pts for each dead end or missing detail.',
        expectedSignals: ['cancel', 'subscription', 'access end'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'market-ranking-media-v2',
    sector: 'media',
    mode: 'knowledge',
    prompt:
      'Based on your knowledge, name 3 direct competitors to {domain} in the media space and rank them by market share or audience size. Then state where {domain} itself sits in that ranking. Reply with your ranked list and reasoning.',
    grades: [
      {
        category: 'market-ranking',
        rubric:
          'Score 0-100 by where {domain} sits in the ranked list the agent itself produced: clear leader 85-100, second 65-84, third 45-64, trailing or unranked 20-44, not recognised as a market participant 0-19. Require at least 3 plausible direct competitors from the same media space; cap the score at 40 if competitors are hallucinated or drawn from a different sector.',
        expectedSignals: ['competitor', 'audience', 'ranking'],
      },
    ],
    maxSteps: 1,
  },
  // ── marketplace ─────────────────────────────────────────────────────────────
  {
    id: 'research-market-v1',
    sector: 'marketplace',
    mode: 'browser',
    prompt:
      'Go to https://{domain} and research it for a customer. Find: (1) what is traded on the marketplace, the buyer and seller personas, and one distinctive feature; (2) the delivery fee or shipping cost, two example listings with their prices, and the buyer-protection policy; (3) the seller commission percentage, and any product or service categories that have a different commission rate. Call done() with all three parts, numbered to match, using exact figures from the site and saying so when something is not stated.',
    grades: [
      {
        category: 'brand-awareness',
        rubric:
          'Score 0-100. Product category (30pts), personas (30pts), feature (40pts). Deduct 20pts for hallucinations.',
        expectedSignals: ['marketplace', 'buyer', 'seller'],
      },
      {
        category: 'information-retrieval',
        rubric:
          'Score 0-100. Delivery fee (30pts), two example listings with prices (30pts), buyer-protection policy (30pts). Correct and sourced from the site (10pts). Deduct 20pts for any hallucinated data.',
        expectedSignals: ['delivery fee', 'listing', 'buyer protection'],
      },
      {
        category: 'accuracy',
        rubric:
          'Score 0-100. Answered the commission question (50pts). Correctly identified any category-specific rates (50pts). Deduct 40pts for hallucinations or invented commission structures.',
        expectedSignals: ['commission', 'percentage', 'category rate'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'journey-market-v1',
    sector: 'marketplace',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Step 1: starting from the homepage, navigate to the vendor or seller listing page where sellers are listed or can be browsed, and note its URL and what is shown. Step 2: from there, find any listing or service, add it to the cart or basket, and proceed to checkout up to but not including the payment step. Do NOT enter payment details or complete payment. If you cannot complete step 1, say so and still attempt step 2. Call done() with the seller listing URL and a description of it, then the URL reached in step 2 and the form fields visible.',
    grades: [
      {
        category: 'discovery',
        rubric:
          'Score 0-100. Found the vendor/seller listing page within 3 nav hops (60pts). Correctly identified it as a seller or vendor directory (40pts). Deduct 20pts for each dead end.',
        expectedSignals: ['vendor', 'seller', 'listing', 'page URL'],
      },
      {
        category: 'checkout',
        rubric:
          'Score 0-100. Found a listing (20pts). Added to cart/basket (20pts). Reached the checkout or payment form (40pts). Reported the URL and form fields (20pts). Deduct 20pts for each bot challenge or CAPTCHA hit.',
        expectedSignals: ['listing', 'cart', 'checkout form'],
      },
    ],
    maxSteps: 30,
  },
  {
    id: 'delegated-access-market-v1',
    sector: 'marketplace',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find any vendor or marketplace API. Identify the supported auth model and list any available scopes. Call done() with the docs URL, auth model, and scopes found.',
    grades: [
      {
        category: 'delegated-access',
        rubric:
          'Score 0-100. Found the vendor or marketplace API documentation (40pts). Correctly identified the auth model (40pts). Listed specific scopes or permissions (20pts). Deduct 20pts if no API is available but that is the correct answer.',
        expectedSignals: ['vendor API', 'auth model', 'scopes'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'support-market-v1',
    sector: 'marketplace',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find how to raise a dispute or request a refund from a seller. What are the eligibility conditions and the process steps? Call done() with the dispute/refund path and conditions.',
    grades: [
      {
        category: 'support',
        rubric:
          'Score 0-100. Found the dispute or refund path (50pts). Correctly extracted the eligibility conditions and process steps (50pts). Deduct 20pts for each dead end or missing condition.',
        expectedSignals: ['dispute', 'refund', 'seller', 'conditions'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'market-ranking-market-v2',
    sector: 'marketplace',
    mode: 'knowledge',
    prompt:
      'Based on your knowledge, name 3 direct competitors to {domain} in the marketplace space and rank them by market share. Then state where {domain} itself sits in that ranking. Reply with your ranked list and reasoning.',
    grades: [
      {
        category: 'market-ranking',
        rubric:
          'Score 0-100 by where {domain} sits in the ranked list the agent itself produced: clear leader 85-100, second 65-84, third 45-64, trailing or unranked 20-44, not recognised as a market participant 0-19. Require at least 3 plausible direct competitors from the same marketplace space; cap the score at 40 if competitors are hallucinated or drawn from a different sector.',
        expectedSignals: ['competitor', 'market share', 'ranking'],
      },
    ],
    maxSteps: 1,
  },
  // ── professional-services ───────────────────────────────────────────────────
  {
    id: 'research-services-v1',
    sector: 'professional-services',
    mode: 'browser',
    prompt:
      'Go to https://{domain} and research it for a customer. Find: (1) the firm name, the services it offers, and the kind of client it targets (startup, enterprise, public sector, consumers); (2) the core service areas offered, one named client or case study, and how a prospective client starts an engagement (form, call booking, email); (3) whether the firm publishes pricing, rates, or engagement models (fixed fee, retainer, time and materials), reporting exactly what is and is not disclosed. Call done() with all three parts, numbered to match, using exact figures from the site and saying so when something is not stated.',
    grades: [
      {
        category: 'brand-awareness',
        rubric:
          'Score 0-100. Firm name (30pts), services offered (40pts), target client (30pts). Deduct 20pts for hallucinations.',
        expectedSignals: ['firm', 'services', 'client'],
      },
      {
        category: 'information-retrieval',
        rubric:
          'Score 0-100. Service areas (30pts), a named client or case study (30pts), the engagement path (30pts). Correct and sourced from the site (10pts). Deduct 20pts for any hallucinated data.',
        expectedSignals: ['services', 'case study', 'engagement'],
      },
      {
        category: 'accuracy',
        rubric:
          'Score 0-100. Answered what pricing or engagement-model information is published (50pts). Answer was factually correct and sourced from the site, including correctly reporting absence (50pts). Deduct 40pts for invented rates or models.',
        expectedSignals: ['pricing', 'engagement model', 'disclosure'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'journey-services-v1',
    sector: 'professional-services',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Step 1: starting from the homepage, navigate to the services or capabilities page, and note its URL and the service areas listed. Step 2: from there, find the primary call-to-action for starting an engagement (contact form, call booking, proposal request) and reach the form. Do NOT submit it. If you cannot complete step 1, say so and still attempt step 2. Call done() with the services page URL and service areas, then the URL reached in step 2 and the fields visible on the form.',
    grades: [
      {
        category: 'discovery',
        rubric:
          'Score 0-100. Found the services/capabilities page within 3 nav hops (60pts). Correctly listed at least two service areas (40pts). Deduct 20pts for each dead end.',
        expectedSignals: ['services', 'capabilities', 'page URL'],
      },
      {
        category: 'checkout',
        rubric:
          'Score 0-100. Found the primary CTA (20pts). Clicked through (20pts). Reached a working enquiry or booking form (40pts). Reported the URL and form fields (20pts). Deduct 20pts for each bot challenge or CAPTCHA hit.',
        expectedSignals: ['contact', 'booking', 'form fields'],
      },
    ],
    maxSteps: 30,
  },
  {
    id: 'delegated-access-services-v1',
    sector: 'professional-services',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find any client portal, partner programme, or API documentation. Identify how an external service or agent could integrate or check engagement status. Call done() with the docs URL (if any) and your assessment of the access model.',
    grades: [
      {
        category: 'delegated-access',
        rubric:
          'Score 0-100. Found a portal, partner programme, or API documentation (40pts). Correctly identified the access model (40pts). Named specific integration details (20pts). Deduct 20pts if none exists but that is the correct answer.',
        expectedSignals: ['portal', 'API', 'access model'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'support-services-v1',
    sector: 'professional-services',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find how to contact the firm: channels available (email, phone, form), office locations, and any stated response expectations. Do not submit a contact form or send a message. Call done() with the contact path and details found.',
    grades: [
      {
        category: 'support',
        rubric:
          'Score 0-100. Found a working contact channel (50pts). Correctly reported locations and any response expectations (50pts). Deduct 20pts for each dead end or missing detail.',
        expectedSignals: ['contact', 'email', 'phone', 'location'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'market-ranking-services-v2',
    sector: 'professional-services',
    mode: 'knowledge',
    prompt:
      'Based on your knowledge, name 3 direct competitors to {domain} in its professional-services niche and rank them by reputation or market presence. Then state where {domain} itself sits in that ranking. Reply with your ranked list and reasoning.',
    grades: [
      {
        category: 'market-ranking',
        rubric:
          'Score 0-100 by where {domain} sits in the ranked list the agent itself produced: clear leader 85-100, second 65-84, third 45-64, trailing or unranked 20-44, not recognised as a market participant 0-19. Require at least 3 plausible direct competitors from the same professional-services niche; cap the score at 40 if competitors are hallucinated or drawn from a different sector.',
        expectedSignals: ['competitor', 'reputation', 'ranking'],
      },
    ],
    maxSteps: 1,
  },
  // ── developer-tools ─────────────────────────────────────────────────────────
  {
    id: 'research-devtools-v1',
    sector: 'developer-tools',
    mode: 'browser',
    prompt:
      'Go to https://{domain} and research it for a customer. Find: (1) the product name, what it helps developers do, and the languages, frameworks or platforms it supports; (2) the command or package name used to install it (npm, pip, brew, CLI download or similar), the latest released version or release date, and the free tier or open-source licence; (3) the rate limits or usage quotas that apply on the free or entry tier, and whether self-hosting is supported, reporting exactly what is and is not documented. Call done() with all three parts, numbered to match, using exact figures from the site and saying so when something is not stated.',
    grades: [
      {
        category: 'brand-awareness',
        rubric:
          'Score 0-100. Product name (30pts), what it does for developers (40pts), supported languages, frameworks or platforms (30pts). Deduct 20pts for hallucinations.',
        expectedSignals: ['product', 'developers', 'languages'],
      },
      {
        category: 'information-retrieval',
        rubric:
          'Score 0-100. Install command or package name (30pts), latest version or release date (30pts), free tier or licence (30pts). Correct and sourced from the site (10pts). Deduct 20pts for any hallucinated data.',
        expectedSignals: ['install', 'version', 'licence'],
      },
      {
        category: 'accuracy',
        rubric:
          'Score 0-100. Answered the free or entry tier limits (50pts). Answered whether self-hosting is supported (50pts). Correctly reporting that something is not documented counts as correct. Deduct 40pts for invented limits or options.',
        expectedSignals: ['rate limit', 'quota', 'self-hosted'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'journey-devtools-v1',
    sector: 'developer-tools',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Step 1: starting from the homepage, navigate to the documentation and find the quickstart or getting-started guide, and note its URL and the first setup step it gives. Step 2: from there, find the primary call-to-action for getting started (sign up, create an account, get an API key) and reach the signup form or first-run screen. Do NOT complete registration or submit the form. If you cannot complete step 1, say so and still attempt step 2. Call done() with the guide URL and its first setup step, then the URL reached in step 2 and the sign-in options or fields visible.',
    grades: [
      {
        category: 'discovery',
        rubric:
          'Score 0-100. Found the docs within 2 nav hops (30pts). Reached the quickstart or getting-started guide within 4 hops (40pts). Correctly reported the first setup step (30pts). Deduct 20pts for each dead end.',
        expectedSignals: ['docs', 'quickstart', 'page URL'],
      },
      {
        category: 'checkout',
        rubric:
          'Score 0-100. Found the primary CTA (20pts). Clicked through (20pts). Reached the signup form or first-run screen (40pts). Reported the URL and sign-in options or fields (20pts). Deduct 20pts for each bot challenge or CAPTCHA hit.',
        expectedSignals: ['sign up', 'API key', 'form fields'],
      },
    ],
    maxSteps: 30,
  },
  {
    id: 'delegated-access-devtools-v1',
    sector: 'developer-tools',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find the API reference and how an agent or CI system authenticates: personal access tokens, API keys, OAuth apps, or an MCP server. Call done() with the docs URL, the auth model, and at least two scopes or permission levels.',
    grades: [
      {
        category: 'delegated-access',
        rubric:
          'Score 0-100. Found the API reference (30pts). Correctly identified the auth model (30pts). Listed at least two scopes or permission levels (20pts). Found an MCP server or agent-specific integration, or correctly reported there is none (20pts). Deduct 20pts if no API is available but that is the correct answer.',
        expectedSignals: ['API reference', 'token', 'scopes', 'MCP'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'support-devtools-v1',
    sector: 'developer-tools',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find where to report a bug or get technical help (issue tracker, community forum, Discord, support ticket) and the public status page, if any. Do not submit a form, open a ticket or send a message. Call done() with the channels and URLs found.',
    grades: [
      {
        category: 'support',
        rubric:
          'Score 0-100. Found a working bug report or technical help channel (50pts). Found the status page, or correctly reported there is none (30pts). Reported the URLs (20pts). Deduct 20pts for each dead end.',
        expectedSignals: ['issues', 'community', 'status page'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'market-ranking-devtools-v2',
    sector: 'developer-tools',
    mode: 'knowledge',
    prompt:
      'Based on your knowledge, name 3 direct competitors to {domain} in the same developer-tools category and rank them by developer adoption. Then state where {domain} itself sits in that ranking. Reply with your ranked list and reasoning.',
    grades: [
      {
        category: 'market-ranking',
        rubric:
          'Score 0-100 by where {domain} sits in the ranked list the agent itself produced: clear leader 85-100, second 65-84, third 45-64, trailing or unranked 20-44, not recognised as a market participant 0-19. Require at least 3 plausible direct competitors from the same developer-tools category; cap the score at 40 if competitors are hallucinated or drawn from a different sector.',
        expectedSignals: ['competitor', 'adoption', 'ranking'],
      },
    ],
    maxSteps: 1,
  },
  // ── utilities ───────────────────────────────────────────────────────────────
  {
    id: 'research-utilities-v1',
    sector: 'utilities',
    mode: 'browser',
    prompt:
      'Go to https://{domain} and research it for a customer. Find: (1) the tool or service name, the job it does for the user (convert, search, calculate, check, translate, forecast or similar), and who it is for; (2) whether the core tool is free to use, any usage limit (file size, requests per day, characters), and whether an account is required; (3) what happens to data or files a user submits (retention period, whether it is stored or shared), and whether the method or data source behind the results is stated, reporting exactly what is and is not disclosed. Call done() with all three parts, numbered to match, using exact figures from the site and saying so when something is not stated.',
    grades: [
      {
        category: 'brand-awareness',
        rubric:
          'Score 0-100. Tool name (30pts), the job it does (40pts), intended user (30pts). Deduct 20pts for hallucinations.',
        expectedSignals: ['tool', 'job', 'user'],
      },
      {
        category: 'information-retrieval',
        rubric:
          'Score 0-100. Free or paid (30pts), usage limit (30pts), account requirement (30pts). Correct and sourced from the site (10pts). Deduct 20pts for any hallucinated data.',
        expectedSignals: ['free', 'limit', 'account'],
      },
      {
        category: 'accuracy',
        rubric:
          'Score 0-100. Answered the data handling or retention question (50pts). Answered whether the method or data source is stated (50pts). Correctly reporting absence counts as correct. Deduct 40pts for invented policies.',
        expectedSignals: ['privacy', 'retention', 'data source'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'journey-utilities-v1',
    sector: 'utilities',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Step 1: starting from the homepage, find the list of tools or features the site offers and open one of them, and note the URL and the tools listed. Step 2: from there, use the primary tool with a safe, generic input (for example a short sample sentence, a unit conversion, or the example value the page suggests) and get a result. Do NOT upload personal files or enter personal details. If you cannot complete step 1, say so and still attempt step 2. Call done() with the tool page URL and the tools listed, then the input used in step 2 and the result returned.',
    grades: [
      {
        category: 'discovery',
        rubric:
          'Score 0-100. Found the list of tools or features within 2 nav hops (40pts). Opened a working tool page (40pts). Listed at least two tools or features (20pts). Deduct 20pts for each dead end.',
        expectedSignals: ['tools', 'features', 'page URL'],
      },
      {
        category: 'checkout',
        rubric:
          'Score 0-100. Found the primary tool (20pts). Entered a valid input (20pts). Got a result on the page (40pts). Reported the input and result accurately (20pts). Deduct 20pts for each bot challenge, CAPTCHA or forced sign-in hit.',
        expectedSignals: ['input', 'result', 'tool'],
      },
    ],
    maxSteps: 30,
  },
  {
    id: 'delegated-access-utilities-v1',
    sector: 'utilities',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find any API, embeddable widget, browser extension or MCP server that lets another service or agent use the tool directly. Identify the access model (free, API key, paid plan). Call done() with the docs URL (if any) and the access model.',
    grades: [
      {
        category: 'delegated-access',
        rubric:
          'Score 0-100. Found an API, widget, extension or MCP server (40pts). Correctly identified the access model (40pts). Named specific limits or endpoints (20pts). Deduct 20pts if none exists but that is the correct answer.',
        expectedSignals: ['API', 'widget', 'access model'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'support-utilities-v1',
    sector: 'utilities',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find how to report a wrong result or get help: contact form, email, FAQ or feedback link. Do not submit a form or send a message. Call done() with the contact path and details found.',
    grades: [
      {
        category: 'support',
        rubric:
          'Score 0-100. Found a working help or feedback channel (50pts). Found an FAQ or help page that answers common questions (30pts). Reported the URLs (20pts). Deduct 20pts for each dead end.',
        expectedSignals: ['contact', 'FAQ', 'feedback'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'market-ranking-utilities-v2',
    sector: 'utilities',
    mode: 'knowledge',
    prompt:
      'Based on your knowledge, name 3 direct competitors to {domain} in the same category of online tool or utility and rank them by usage. Then state where {domain} itself sits in that ranking. Reply with your ranked list and reasoning.',
    grades: [
      {
        category: 'market-ranking',
        rubric:
          'Score 0-100 by where {domain} sits in the ranked list the agent itself produced: clear leader 85-100, second 65-84, third 45-64, trailing or unranked 20-44, not recognised as a market participant 0-19. Require at least 3 plausible direct competitors from the same category of online tool or utility; cap the score at 40 if competitors are hallucinated or drawn from a different sector.',
        expectedSignals: ['competitor', 'usage', 'ranking'],
      },
    ],
    maxSteps: 1,
  },
  // ── social ──────────────────────────────────────────────────────────────────
  {
    id: 'research-social-v1',
    sector: 'social',
    mode: 'browser',
    prompt:
      'Go to https://{domain} and research it for a customer. Find: (1) the network or community name, what people share or discuss there, and who it is primarily for; (2) the minimum age to create an account, the rules or community guidelines URL, and whether posts can be public, private, or both; (3) whether there is a paid tier or subscription and what it adds, and whether users can download or export their data, reporting exactly what is and is not offered. Call done() with all three parts, numbered to match, using exact figures from the site and saying so when something is not stated.',
    grades: [
      {
        category: 'brand-awareness',
        rubric:
          'Score 0-100. Network name (30pts), what people share or discuss (40pts), primary audience (30pts). Deduct 20pts for hallucinations.',
        expectedSignals: ['network', 'content', 'audience'],
      },
      {
        category: 'information-retrieval',
        rubric:
          'Score 0-100. Minimum age (30pts), guidelines URL (30pts), post visibility options (30pts). Correct and sourced from the site (10pts). Deduct 20pts for any hallucinated data.',
        expectedSignals: ['age', 'guidelines', 'visibility'],
      },
      {
        category: 'accuracy',
        rubric:
          'Score 0-100. Answered the paid tier question with its benefits, or correctly reported there is none (50pts). Answered the data export question (50pts). Deduct 40pts for invented tiers or features.',
        expectedSignals: ['subscription', 'premium', 'data export'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'journey-social-v1',
    sector: 'social',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Step 1: starting from the homepage, without signing in, find a public profile, community, or discussion thread on a topic of your choice, and note its URL and a one-line summary of what is there (or that a sign-in wall blocks it). Step 2: from there, find the sign-up flow and reach the account creation form. Do NOT complete registration or submit the form. If you cannot complete step 1, say so and still attempt step 2. Call done() with the public page URL and summary, then the URL reached in step 2 and the sign-up methods or fields visible.',
    grades: [
      {
        category: 'discovery',
        rubric:
          'Score 0-100. Reached public content within 3 nav hops or one search (60pts). Content was readable without signing in, or the agent correctly reported that a sign-in wall blocks it (40pts). Deduct 20pts for each dead end or login wall not reported.',
        expectedSignals: ['profile', 'community', 'page URL'],
      },
      {
        category: 'checkout',
        rubric:
          'Score 0-100. Found the sign-up CTA (20pts). Clicked through (20pts). Reached the account creation form (40pts). Reported the URL and sign-up methods or fields (20pts). Deduct 20pts for each bot challenge or CAPTCHA hit.',
        expectedSignals: ['sign up', 'account', 'form fields'],
      },
    ],
    maxSteps: 30,
  },
  {
    id: 'delegated-access-social-v1',
    sector: 'social',
    mode: 'browser',
    prompt:
      "Go to https://{domain}. Find the developer platform or API and identify how a third-party app or agent could read or post on a user's behalf: OAuth scopes, app review, pricing or access tiers. Call done() with the docs URL, the auth model, and at least two scopes or permissions.",
    grades: [
      {
        category: 'delegated-access',
        rubric:
          'Score 0-100. Found the developer platform or API (40pts). Correctly identified the auth model and any access tiers (40pts). Listed at least two specific scopes or permissions (20pts). Deduct 20pts if no API is available but that is the correct answer.',
        expectedSignals: ['developer platform', 'OAuth scopes', 'permissions'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'support-social-v1',
    sector: 'social',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find how to report abusive content or an account, and how to recover a locked or hacked account. Call done() with the reporting path and the recovery steps found.',
    grades: [
      {
        category: 'support',
        rubric:
          'Score 0-100. Found the content or account reporting path (50pts). Found the account recovery steps (50pts). Deduct 20pts for each dead end or missing detail.',
        expectedSignals: ['report', 'safety', 'account recovery'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'market-ranking-social-v2',
    sector: 'social',
    mode: 'knowledge',
    prompt:
      'Based on your knowledge, name 3 direct competitors to {domain} in the same social network or community space and rank them by active users. Then state where {domain} itself sits in that ranking. Reply with your ranked list and reasoning.',
    grades: [
      {
        category: 'market-ranking',
        rubric:
          'Score 0-100 by where {domain} sits in the ranked list the agent itself produced: clear leader 85-100, second 65-84, third 45-64, trailing or unranked 20-44, not recognised as a market participant 0-19. Require at least 3 plausible direct competitors from the same social network or community space; cap the score at 40 if competitors are hallucinated or drawn from a different sector.',
        expectedSignals: ['competitor', 'active users', 'ranking'],
      },
    ],
    maxSteps: 1,
  },
  // ── education ───────────────────────────────────────────────────────────────
  {
    id: 'research-education-v1',
    sector: 'education',
    mode: 'browser',
    prompt:
      'Go to https://{domain} and research it for a customer. Find: (1) the institution or platform name, what it teaches, and who its learners are (school students, university, professionals, hobbyists); (2) for one course or programme, the cost or fees, the duration or time commitment, and the entry requirements or prerequisites; (3) whether the qualification or certificate is formally accredited and by whom, and whether financial aid, scholarships or a free option exist, reporting exactly what is and is not stated. Call done() with all three parts, numbered to match, using exact figures from the site and saying so when something is not stated.',
    grades: [
      {
        category: 'brand-awareness',
        rubric:
          'Score 0-100. Institution or platform name (30pts), subjects or programmes (40pts), learner audience (30pts). Deduct 20pts for hallucinations.',
        expectedSignals: ['institution', 'courses', 'learners'],
      },
      {
        category: 'information-retrieval',
        rubric:
          'Score 0-100. Cost or fees (30pts), duration (30pts), entry requirements (30pts). Correct and sourced from the site (10pts). Deduct 20pts for any hallucinated data.',
        expectedSignals: ['fees', 'duration', 'entry requirements'],
      },
      {
        category: 'accuracy',
        rubric:
          'Score 0-100. Answered the accreditation question with the accrediting body, or correctly reported it is not stated (50pts). Answered the financial aid or free option question (50pts). Deduct 40pts for invented accreditation or aid.',
        expectedSignals: ['accreditation', 'certificate', 'financial aid'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'journey-education-v1',
    sector: 'education',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Step 1: starting from the homepage, find the course or programme catalogue and open one course, and note its URL and the course name. Step 2: from there, find the enrol or apply CTA for that course (or any other) and reach the enrolment or application form. Do NOT submit it. If you cannot complete step 1, say so and still attempt step 2. Call done() with the course page URL and course name, then the URL reached in step 2 and the fields visible on the form.',
    grades: [
      {
        category: 'discovery',
        rubric:
          'Score 0-100. Found the catalogue within 3 nav hops (40pts). Opened a specific course or programme page (40pts). Reported the URL and course name (20pts). Deduct 20pts for each dead end.',
        expectedSignals: ['courses', 'programme', 'page URL'],
      },
      {
        category: 'checkout',
        rubric:
          'Score 0-100. Found the enrol or apply CTA (20pts). Clicked through (20pts). Reached the enrolment or application form (40pts). Reported the URL and form fields (20pts). Deduct 20pts for each bot challenge or CAPTCHA hit.',
        expectedSignals: ['enrol', 'apply', 'form fields'],
      },
    ],
    maxSteps: 30,
  },
  {
    id: 'delegated-access-education-v1',
    sector: 'education',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find any API, LTI integration, or parent or guardian access that lets another service or person act for a learner (view progress, manage enrolments). Call done() with the docs URL (if any) and your assessment of the access model.',
    grades: [
      {
        category: 'delegated-access',
        rubric:
          'Score 0-100. Found an API, LTI integration, or delegated access feature (40pts). Correctly identified the access model (40pts). Named specific integration details (20pts). Deduct 20pts if none exists but that is the correct answer.',
        expectedSignals: ['API', 'LTI', 'access model'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'support-education-v1',
    sector: 'education',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find the refund or withdrawal policy and how a learner contacts student support. Do not submit a form or send a message. Call done() with the policy details and the contact path.',
    grades: [
      {
        category: 'support',
        rubric:
          'Score 0-100. Found the refund or withdrawal policy (50pts). Found a working student support channel (50pts). Deduct 20pts for each dead end or missing detail.',
        expectedSignals: ['refund', 'withdrawal', 'student support'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'market-ranking-education-v2',
    sector: 'education',
    mode: 'knowledge',
    prompt:
      'Based on your knowledge, name 3 direct competitors to {domain} in the same education space and rank them by reputation or learner numbers. Then state where {domain} itself sits in that ranking. Reply with your ranked list and reasoning.',
    grades: [
      {
        category: 'market-ranking',
        rubric:
          'Score 0-100 by where {domain} sits in the ranked list the agent itself produced: clear leader 85-100, second 65-84, third 45-64, trailing or unranked 20-44, not recognised as a market participant 0-19. Require at least 3 plausible direct competitors from the same education space; cap the score at 40 if competitors are hallucinated or drawn from a different sector.',
        expectedSignals: ['competitor', 'reputation', 'ranking'],
      },
    ],
    maxSteps: 1,
  },
  // ── health ──────────────────────────────────────────────────────────────────
  {
    id: 'research-health-v1',
    sector: 'health',
    mode: 'browser',
    prompt:
      'Go to https://{domain} and research it for a customer. Find: (1) the provider or service name, the kind of care or health information it offers, and who it serves; (2) the cost of a standard consultation or service (or that it is covered or free), the opening hours or availability, and which insurers or funding schemes are accepted; (3) whether the site says what to do in an emergency, and whether its medical content is reviewed by named clinicians or dated, reporting exactly what is and is not stated. Call done() with all three parts, numbered to match, using exact figures from the site and saying so when something is not stated.',
    grades: [
      {
        category: 'brand-awareness',
        rubric:
          'Score 0-100. Provider or service name (30pts), care or information offered (40pts), who it serves (30pts). Deduct 20pts for hallucinations.',
        expectedSignals: ['provider', 'care', 'patients'],
      },
      {
        category: 'information-retrieval',
        rubric:
          'Score 0-100. Consultation cost or coverage (30pts), hours or availability (30pts), insurers or funding accepted (30pts). Correct and sourced from the site (10pts). Deduct 20pts for any hallucinated data.',
        expectedSignals: ['cost', 'hours', 'insurance'],
      },
      {
        category: 'accuracy',
        rubric:
          'Score 0-100. Answered the emergency guidance question (50pts). Answered the clinical review or dating question (50pts). Correctly reporting absence counts as correct. Deduct 40pts for invented guidance or reviewers.',
        expectedSignals: ['emergency', 'medically reviewed', 'last updated'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'journey-health-v1',
    sector: 'health',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Step 1: starting from the homepage, find the page for booking an appointment or finding a practitioner or service, and note its URL and the options shown. Step 2: from there, start booking an appointment, consultation, or service and reach the step where personal details are requested. Do NOT enter personal or medical details, and do not submit the form. If you cannot complete step 1, say so and still attempt step 2. Call done() with the booking page URL and the options shown, then the URL reached in step 2 and the fields visible on the form.',
    grades: [
      {
        category: 'discovery',
        rubric:
          'Score 0-100. Found the booking or find-a-practitioner page within 3 nav hops (60pts). Correctly listed the options shown (40pts). Deduct 20pts for each dead end.',
        expectedSignals: ['appointment', 'find a doctor', 'page URL'],
      },
      {
        category: 'checkout',
        rubric:
          'Score 0-100. Found the booking CTA (20pts). Clicked through (20pts). Reached the personal details step (40pts). Reported the URL and form fields (20pts). Deduct 20pts for each bot challenge or CAPTCHA hit.',
        expectedSignals: ['book', 'appointment', 'form fields'],
      },
    ],
    maxSteps: 30,
  },
  {
    id: 'delegated-access-health-v1',
    sector: 'health',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find any patient portal, carer or proxy access, or API (for example FHIR) that lets another person or service act for a patient. Call done() with the docs URL (if any) and your assessment of the access model.',
    grades: [
      {
        category: 'delegated-access',
        rubric:
          'Score 0-100. Found a portal, proxy access, or API (40pts). Correctly identified the access model (40pts). Named specific integration or consent details (20pts). Deduct 20pts if none exists but that is the correct answer.',
        expectedSignals: ['patient portal', 'proxy access', 'FHIR'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'support-health-v1',
    sector: 'health',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find how to contact the provider, how to request medical records, and how to make a complaint. Do not submit a form or send a message. Call done() with the contact path and details found.',
    grades: [
      {
        category: 'support',
        rubric:
          'Score 0-100. Found a working contact channel (40pts). Found how to request records (30pts). Found the complaints process (30pts). Deduct 20pts for each dead end or missing detail.',
        expectedSignals: ['contact', 'medical records', 'complaints'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'market-ranking-health-v2',
    sector: 'health',
    mode: 'knowledge',
    prompt:
      'Based on your knowledge, name 3 direct competitors to {domain} in the same health space and rank them by reputation or patient numbers. Then state where {domain} itself sits in that ranking. Reply with your ranked list and reasoning.',
    grades: [
      {
        category: 'market-ranking',
        rubric:
          'Score 0-100 by where {domain} sits in the ranked list the agent itself produced: clear leader 85-100, second 65-84, third 45-64, trailing or unranked 20-44, not recognised as a market participant 0-19. Require at least 3 plausible direct competitors from the same health space; cap the score at 40 if competitors are hallucinated or drawn from a different sector.',
        expectedSignals: ['competitor', 'reputation', 'ranking'],
      },
    ],
    maxSteps: 1,
  },
  // ── government ──────────────────────────────────────────────────────────────
  {
    id: 'research-government-v1',
    sector: 'government',
    mode: 'browser',
    prompt:
      'Go to https://{domain} and research it for a customer. Find: (1) the agency, department or council name, the jurisdiction it covers, and the main services it provides; (2) for one service, who is eligible, the fee (or that it is free), and the documents or proof required; (3) for that same service, the stated processing time, and whether it can be completed fully online or needs an in-person step, reporting exactly what is and is not stated. Call done() with all three parts, numbered to match, using exact figures from the site and saying so when something is not stated.',
    grades: [
      {
        category: 'brand-awareness',
        rubric:
          'Score 0-100. Agency name (30pts), jurisdiction (30pts), main services (40pts). Deduct 20pts for hallucinations.',
        expectedSignals: ['agency', 'jurisdiction', 'services'],
      },
      {
        category: 'information-retrieval',
        rubric:
          'Score 0-100. Eligibility (30pts), fee (30pts), required documents (30pts). Correct and sourced from the site (10pts). Deduct 20pts for any hallucinated data.',
        expectedSignals: ['eligibility', 'fee', 'documents'],
      },
      {
        category: 'accuracy',
        rubric:
          'Score 0-100. Answered the processing time question (50pts). Answered the online versus in-person question (50pts). Correctly reporting absence counts as correct. Deduct 40pts for invented timelines or steps.',
        expectedSignals: ['processing time', 'online', 'in person'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'journey-government-v1',
    sector: 'government',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Step 1: starting from the homepage, find the page for one common service (for example renewing a licence, applying for a permit, or claiming a benefit), and note its URL and the service name. Step 2: from there, start the online application or form for that service (or another) and reach the first step that asks for details or a sign-in. Do NOT submit the form or sign in. If you cannot complete step 1, say so and still attempt step 2. Call done() with the service page URL and name, then the URL reached in step 2 and the fields or identity options visible.',
    grades: [
      {
        category: 'discovery',
        rubric:
          'Score 0-100. Found a specific service page within 3 nav hops or one search (60pts). Correctly named the service (40pts). Deduct 20pts for each dead end.',
        expectedSignals: ['service', 'apply', 'page URL'],
      },
      {
        category: 'checkout',
        rubric:
          'Score 0-100. Found the start CTA (20pts). Clicked through (20pts). Reached the first form or sign-in step (40pts). Reported the URL and fields or identity options (20pts). Deduct 20pts for each bot challenge or CAPTCHA hit.',
        expectedSignals: ['apply online', 'sign in', 'form fields'],
      },
    ],
    maxSteps: 30,
  },
  {
    id: 'delegated-access-government-v1',
    sector: 'government',
    mode: 'browser',
    prompt:
      "Go to https://{domain}. Find whether someone can act on another person's behalf (a representative, nominee, agent or power of attorney) and whether the agency publishes APIs or open data. Call done() with the process or docs URL and your assessment of the access model.",
    grades: [
      {
        category: 'delegated-access',
        rubric:
          'Score 0-100. Found the representative or nominee process (40pts). Correctly identified the access model (40pts). Found published APIs or open data, or correctly reported there are none (20pts). Deduct 20pts if none exists but that is the correct answer.',
        expectedSignals: ['representative', 'nominee', 'API', 'open data'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'support-government-v1',
    sector: 'government',
    mode: 'browser',
    prompt:
      'Go to https://{domain}. Find how to contact the agency (phone, online enquiry, office locations) and how to lodge a complaint or request a review of a decision. Do not submit a form or send a message. Call done() with the contact path and details found.',
    grades: [
      {
        category: 'support',
        rubric:
          'Score 0-100. Found a working contact channel (50pts). Found the complaint or review process (50pts). Deduct 20pts for each dead end or missing detail.',
        expectedSignals: ['contact', 'complaint', 'review'],
      },
    ],
    maxSteps: 25,
  },
  {
    id: 'market-ranking-government-v2',
    sector: 'government',
    mode: 'knowledge',
    prompt:
      'Based on your knowledge, name 3 comparable agencies or services to {domain} in other jurisdictions and rank them by how easy their online services are to use. Then state where {domain} itself sits in that ranking. Reply with your ranked list and reasoning.',
    grades: [
      {
        category: 'market-ranking',
        rubric:
          'Score 0-100 by where {domain} sits in the ranked list the agent itself produced: clear leader 85-100, second 65-84, third 45-64, trailing or unranked 20-44, not recognised 0-19. Require at least 3 plausible comparable agencies or services; cap the score at 40 if they are hallucinated or not government bodies.',
        expectedSignals: ['comparable agency', 'online services', 'ranking'],
      },
    ],
    maxSteps: 1,
  },
];

export function getTasksForSector(sector: DomainSector): TaskDefinition[] {
  return TASKS.filter((t) => t.sector === sector);
}

/**
 * Fills a task prompt for `domain`. Pass the resolved `origin` (see
 * `./origin`) and the prompt's starting URL, `https://{domain}`, becomes the
 * origin the site actually serves from, so a session on an apex that only
 * answers on `www` (or over http) starts on the real site. Every other
 * mention keeps the bare domain, which is how people name the site.
 */
export function interpolatePrompt(template: string, domain: string, origin?: string): string {
  const withOrigin = origin ? template.replaceAll('https://{domain}', origin) : template;
  return withOrigin.replaceAll('{domain}', domain);
}

/**
 * The sector's agent-session tasks that are worth running for a domain, each
 * graded only for the categories that apply to it. A task that grades several
 * categories stays while any of them applies; one left with no applicable
 * category is skipped, so it costs no browser session.
 */
export function getApplicableTasks(
  sector: DomainSector,
  scores: ReadonlyArray<{ category: string; applicable?: boolean }> | null | undefined
): TaskDefinition[] {
  return getTasksForSector(sector).flatMap((t) => {
    const grades = t.grades.filter((g) => isCategoryApplicable(scores, g.category));
    if (grades.length === 0) return [];
    return grades.length === t.grades.length ? [t] : [{ ...t, grades }];
  });
}

/**
 * The tasks a run of `depth` drives, in their original order. Judged on each
 * task's own definition rather than the grades left after applicability, so a
 * domain whose probe dropped a category does not change which tasks are light.
 */
export function tasksForDepth(
  tasks: ReadonlyArray<TaskDefinition>,
  depth: AgentRunDepth
): TaskDefinition[] {
  if (depth === 'full') return [...tasks];
  return tasks.filter((t) => {
    if (t.mode === 'knowledge') return true;
    const defined = TASKS.find((d) => d.id === t.id) ?? t;
    return defined.grades.length > 1;
  });
}
