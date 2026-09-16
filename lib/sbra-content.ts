export type SbraPodcastEpisode = {
  title: string;
  date: string;
  duration: string;
  url: string;
};

export type SbraArticle = {
  title: string;
  topic: "Business growth" | "Marketing" | "Money & funding" | "People & leadership" | "Community" | "COVID-19 archive";
  url: string;
};

export type SbraSupportResource = {
  title: string;
  group: "Get help" | "Member programs" | "Promote your business" | "Benefits & policies";
  description: string;
  url: string;
  access?: "Member login required";
};

export const sbraVideoResources = [
  {
    title: "Tuesday Tune Up & Workshop Videos",
    description: "Business and personal-development presentations created by SBRA members.",
    url: "https://www.sbrassociation.com/member-presentations",
    label: "SBRA video hub"
  },
  {
    title: "Watch the complete presentation showcase",
    description: "Open SBRA’s official Vimeo showcase to browse every available Tune Up and workshop video.",
    url: "https://vimeo.com/showcase/10780783",
    label: "Official Vimeo showcase"
  }
];

const podcastRows: Array<[string, string, string, string]> = [
  ["Going From Being a Good to Great Leader with Gary Seibert", "2021-03-22", "20:33", "going-from-being-a-good-to-great-leader-with-gary-seibert"],
  ["Building Multi-Generational Wealth with Paul Marrella", "2021-03-08", "22:43", "building-multi-generational-wealth-with-paul-marrella"],
  ["Securing Your Business and Cherished Items with Jim Long", "2021-02-22", "20:07", "securing-your-business-and-cherished-items-with-jim-long"],
  ["Getting IT Support For Your Company While Working Remote with Andrew Sonon", "2021-02-08", "18:40", "getting-it-support-for-your-company-while-working-remote-with-andrew-sonon"],
  ["Remote Work, Hiring, and HR Necessities with Tom Hubric", "2021-01-18", "19:16", "remote-work-hiring-and-hr-necessities-with-tom-hubric"],
  ["Content is King for Any Business with Ryan Ellenburger", "2021-01-04", "20:44", "content-is-king-for-any-business-with-ryan-ellenburger"],
  ["Improving Your Immune System Naturally to Fight a Pandemic with Nick Kleinsmith", "2020-12-21", "21:12", "improving-your-immune-system-naturally-to-fight-a-pandemic-with-nick-kleinsmith"],
  ["Messages From the Money Masters with Jay Kemmerer", "2020-12-07", "21:04", "messages-from-the-money-masters-with-jay-kemmerer"],
  ["Taking Your Company Social with Drew Bell", "2020-11-23", "20:44", "taking-your-company-social-with-drew-bell"],
  ["Growing Your Business Online with Brian Welch", "2020-11-09", "18:53", "growing-your-business-online-with-brian-welch"],
  ["Online Presence is More Important than Ever with Freddy Vasquez", "2020-10-26", "17:54", "online-presence-is-more-important-than-ever-with-freddy-vasquez"],
  ["Lowering Premiums and Protecting Your Employees with Larry Bonino", "2020-10-12", "18:23", "lowering-premiums-and-protecting-your-employees-with-larry-bonino"],
  ["Automate the Growth of Your Business with Jack Ewald", "2020-09-28", "19:45", "automate-the-growth-of-your-business-with-jack-ewald"],
  ["How to Screen Your Employees Properly with Tom Wentling", "2020-09-14", "21:21", "how-to-screen-your-employees-properly-with-tom-wentling"],
  ["Whats Your Marketing Strategy with Mark Kramer", "2020-08-31", "16:47", "whats-your-marketing-strategy-with-mark-kramer"],
  ["Focusing on Continuous Improvement with Lisa Peterson", "2020-08-17", "20:24", "focusing-on-continuous-improvement-with-lisa-peterson"],
  ["Marketing in a COVID World with Cary Baskin", "2020-08-03", "19:35", "marketing-in-a-covid-world-with-cary-baskin"],
  ["Opening Up and Adapting to a New Market with Frank DeFelice", "2020-07-20", "17:23", "opening-up-and-adapting-to-a-new-market-with-frank-defelice"],
  ["401k's and Securing Your Financial Future with Tyler Parmer", "2020-07-06", "19:33", "401ks-and-securing-your-financial-future-with-tyler-parmer"],
  ["Health Insurance for Small Business Owners During a Pandemic with Evan Markwood", "2020-06-29", "21:04", "health-insurance-for-small-business-owners-during-a-pandemic-with-evan-markwood"],
  ["Honing Your Craft During a Pandemic with Don Carrick", "2020-06-22", "22:16", "honing-your-craft-during-a-pandemic-with-don-carrick"],
  ["SBRA Health Insurance Options with Fred Claghorn", "2020-06-15", "11:24", "sbra-health-insurance-options-with-fred-clagorn"],
  ["Experiencing Growth Now with Justin Schenck", "2020-06-08", "29:06", "experiencing-growth-now-with-justin-schenck"],
  ["Calming the Mind During a Time of Uncertainty with Terri Hill", "2020-06-01", "20:56", "calming-the-mind-during-a-time-of-uncertainty-with-terri-hill"],
  ["Creating that New Mindset with Dena Breslin", "2020-05-25", "19:33", "creating-that-new-mindset-with-dena-breslin"],
  ["Details on PPP and Loans During COVID-19 with Anthony Pomponio", "2020-05-18", "22:50", "details-on-ppp-and-loans-during-covid-19-with-anthony-pomponio"],
  ["Why Video is so Important for Your Business with Mitch DuGuay", "2020-05-11", "23:38", "why-video-is-so-important-for-your-business-with-mitch-duguay"],
  ["LinkedIn Tactics for Small Businesses with Kyra Bell", "2020-05-04", "20:15", "linkedin-tactics-for-small-businesses-with-kyra-bell"],
  ["The Small Business Hurdles During COVID-19 with Larry Miller", "2020-04-27", "20:40", "the-small-business-hurdles-during-covid-19-with-larry-miller"],
  ["Long Term Success Using Customer First Method with Dr. Mindy Brudereck", "2020-04-20", "16:19", "long-term-success-using-customer-first-method-with-dr-mindy-brudereck"],
  ["Setting Your Business Up Financial to be Recession Proof with Paul Marrella", "2020-04-13", "21:03", "setting-your-business-up-financial-to-be-recession-proof-with-paul-marrella"],
  ["Marketing Driven Web Design with Al Robezzoli", "2020-04-06", "17:51", "marketing-driven-web-design-with-al-robezzoli"],
  ["The Future of Robotics and Automation with Rick Aulenbach", "2020-03-30", "22:18", "the-future-of-robotics-and-automation-with-rick-aulenbach"],
  ["Are You Prepared for a Cyber Attack with Alex Thomas", "2020-03-23", "18:59", "are-you-prepared-for-a-cyber-attack-with-alex-thomas"],
  ["Building a Community Within Your Business with Anthony Pomponio", "2020-03-16", "17:32", "building-a-community-within-your-business-with-anthony-pomponio"],
  ["Legal Know How for Small Business with Dave Brennan", "2020-03-09", "22:39", "legal-know-how-for-small-business-with-dave-brennan"],
  ["Leadership, Growth, and Breaking Through with Courtnie Nein", "2020-03-02", "22:13", "leadership-growth-and-breaking-through-with-courtnei-nein"],
  ["Expanding Your Reach in Todays Marketing with Adam Wentling", "2020-02-24", "21:53", "expanding-your-reach-in-todays-marketing-with-adam-wentling"],
  ["The Fear of Sticking Your Neck Out with Gary Seibert", "2020-02-17", "22:48", "the-fear-of-sticking-your-neck-out-with-gary-seibert"],
  ["Mixing Family and Business Successfully with Laura Seibert", "2020-02-10", "16:18", "mixing-family-and-business-successfully-with-laura-seibert"],
  ["It's Not Selling When You're Building Relationships with Jackie Wenrich", "2020-02-03", "18:35", "its-not-selling-when-youre-building-relationships-with-jackie-wenrich"],
  ["The Art of Putting Together a Good Event with Annette Faust", "2020-01-27", "19:10", "the-art-of-putting-together-a-good-event-with-annette-faust"],
  ["Put Fitness First with Tony Laino", "2020-01-20", "19:10", "put-fitness-first-with-tony-laino"],
  ["A Wealth of Entrepreneurial Knowledge with John Robinson", "2020-01-13", "21:22", "a-wealth-of-entrepreneurial-knowledge-with-john-robinson"],
  ["Having 20/20 Vision in 2020 with Gary Seibert", "2020-01-06", "24:12", "having-2020-vision-in-2020-with-gary-seibert"],
  ["Get Yourself Set for Retirement with Kevin Cavanna", "2019-12-30", "20:00", "get-yourself-set-for-retirement-with-kevin-cavanna"],
  ["How Chiropractics Can Help Grow Your Business with Dr. Liz Hansen", "2019-12-23", "24:37", "how-chiropractics-can-help-grow-your-business-with-dr-liz-hansen"],
  ["Bringing Your Clients Vision to Life with Mitch DuGuay", "2019-12-16", "21:24", "bringing-your-clients-vision-to-life-with-mitch-duguay"],
  ["Creating Organization and Funding for Your Non-Profit with Mary Chown", "2019-12-09", "20:12", "creating-organization-and-funding-for-your-non-profit-with-mary-chown"],
  ["A Deeper Dive Into the Sales Process with John Whitehall", "2019-12-02", "17:52", "a-deeper-dive-into-the-sales-process-with-john-whitehall"],
  ["The World of Chiropractic with Dr. Tom Wachtmann", "2019-11-25", "20:40", "the-world-of-chiropractics-with-dr-tom-wachtmann"],
  ["Ramping Up Your Companies Training with Abigail Mirarchi", "2019-11-18", "24:14", "ramping-up-your-companies-training-with-abigail-mirarchi"],
  ["How to Transform Your Town with Mark Ratcliffe", "2019-11-11", "20:40", "how-to-transform-your-town-with-mark-ratcliffe"],
  ["Involving Community in Your Growth with Charlene Lang", "2019-11-04", "19:26", "involving-community-in-your-growth-with-charlene-lang"],
  ["Retail Growth and Prosperity with Linda Stricker", "2019-10-28", "12:41", "retail-growth-and-prosperity-with-linda-stricker"],
  ["Finding Inspiration in a New World with Justin Bortz", "2019-10-21", "23:22", "finding-inspiration-in-a-new-world-with-justin-bortz"],
  ["Leading Others into the New Direction with Tim McLeod", "2019-10-14", "23:28", "leading-others-into-the-new-direction-with-tim-mcleod"],
  ["The Truth About Health Insurance with Evan Markwood", "2019-10-07", "21:38", "the-truth-about-health-insurance-with-evan-markwood"],
  ["The Importance of Working Capital in Any Business with Elvin Rodirguez", "2019-09-30", "23:37", "the-importance-of-working-capital-in-any-business-with-elvin-rodirguez"],
  ["Claiming Your Financial Freedom with Dennis Pellegrini", "2019-09-23", "25:16", "claiming-your-financial-freedom-with-dennis-pellegrini"],
  ["The Specific Way for Chiropractic Solutions with Dr. Bill Moss", "2019-09-16", "24:17", "the-specific-way-for-chiropractic-solutions-with-dr-bill-moss"],
  ["The Art of Staffing Properly with Kristi Gage-Linderman", "2019-09-09", "23:22", "the-art-of-staffing-properly-with-kristi-gage-linderman"],
  ["Building Strong Communities with Michael Kaucher", "2019-09-02", "26:17", "building-strong-communities-with-michael-kaucher"],
  ["Living a Better Life at Any Age with Lynne Ernst", "2019-08-26", "19:45", "living-a-better-life-at-any-age-with-lynne-ernst"],
  ["Part 3: Dealing with Difficult Challenges as a Leader with Gary Seibert", "2019-08-19", "37:47", "part-3-dealing-with-difficult-challenges-as-a-leader-with-gary-seibert"],
  ["Living Healthy, Living Good with Joel Moceri", "2019-08-12", "26:11", "living-healthy-living-good-with-joel-moceri"],
  ["Part 2: Building Your Leadership Team with Gary Seibert", "2019-08-05", "30:49", "part-2-building-your-leadership-team-with-gary-seibert"],
  ["Print Advertising in Todays Market with Bill Haley", "2019-07-29", "26:05", "print-advertising-in-todays-market-with-bill-haley"],
  ["Part 1: Building Your Leadership Skills with Gary Seibert", "2019-07-22", "33:16", "building-your-leadership-skills-with-gary-seibert"],
  ["Using Nutrition to Cure Disease with Eric Shultz", "2019-07-15", "23:00", "using-nutrition-to-cure-disease-with-eric-shultz"],
  ["The Power of Masterminds with Terri Hill", "2019-07-08", "28:29", "the-power-of-masterminds-with-terri-hill"],
  ["The Entrepreneurs Journey with a Smile with Gil Nazario", "2019-07-01", "22:36", "the-entrepreneurs-journey-with-a-smile-with-gil-nazario"],
  ["Keeping Your Business Safe from a Cyber Attack with Mike Rowley", "2019-06-24", "28:00", "protecting-your-business-safe-from-a-cyber-attack-with-mike-rowley"],
  ["Understanding Your Tax Laws with Susan Goldcamp", "2019-06-17", "18:59", "understanding-your-tax-laws-with-susan-goldcamp"],
  ["The Power of Good Photography in Business with Don Carrick", "2019-06-10", "22:43", "the-power-of-good-photography-in-business-with-don-carrick"],
  ["Creating a Stress Free Work Place with Mark Owens", "2019-06-03", "23:53", "creating-a-stress-free-work-place-with-mark-owens"],
  ["The Importance of Having Strong Legal Representation with Larry Miller", "2019-05-27", "29:30", "the-importance-of-having-strong-legal-representation-with-larry-miller"],
  ["Utilizing Your Local Credit Union with Anthony Pomponio", "2019-05-20", "22:17", "utilizing-your-local-credit-union-with-anthony-pomponio"],
  ["Building Business Credit and Securing Loans with Bladimir Mercedes", "2019-05-13", "26:28", "building-business-credit-and-securing-loans-with-bladimir-mercedes"],
  ["Why Self-Care is Important in Business with Amy Hendrix, CRNP", "2019-05-06", "26:08", "why-self-care-is-important-in-business-with-amy-hendrix-crnp"],
  ["Is Franchising Right for You with Mark Kramer", "2019-04-29", "20:21", "is-franchising-right-for-you-with-mark-kramer"],
  ["Growth of Berks County for Local Business with Crystal Seitz", "2019-04-22", "26:31", "growth-of-berks-county-for-local-business-with-crystal-seitz"],
  ["How to Engage Your Employees with Gary Seibert", "2019-04-15", "30:29", "how-to-engage-your-employees-with-gary-seibert"],
  ["Growing Business Through Strong Team Work and Vision with Brennan Reichenbach", "2019-04-08", "29:16", "growing-business-through-strong-team-work-and-vision-with-brennan-reichenbach"],
  ["4 Steps of a Successful Business with Gary Siebert", "2019-04-01", "23:37", "4-steps-of-a-successful-business-with-gary-siebert"],
  ["Building A Good Life with Conor Delaney", "2019-03-25", "29:07", "building-a-good-life-with-conor-delaney"],
  ["Ready, Set, Go..Is Your Business Ready to Launch with Gary Seibert", "2019-03-18", "23:08", "ready-set-gois-your-business-ready-to-launch-with-gary-seibert"],
  ["Power Marketing and Mastering SEO with Al Robezzoli", "2019-03-11", "30:23", "power-marketing-and-mastering-seo-with-al-robezzoli"],
  ["The Importance of Discipline in Business with Gary Seibert", "2019-03-04", "20:13", "the-importance-of-discipline-in-business-with-gary-seibert"],
  ["Retraining Your Brain to Build a Better Life with Dena Breslin", "2019-02-25", "32:40", "retraining-your-brain-to-build-a-better-life-with-dena-breslin"],
  ["Creating Opportunities in Business with Gary Seibert", "2019-02-18", "23:11", "creating-opportunities-in-business-with-gary-seibert"],
  ["Balancing Work and Relationships with Andre Young", "2019-02-11", "37:40", "balancing-work-and-relationships-with-andre-young"],
  ["How to Build the Perfect Team with Gary Seibert", "2019-02-04", "20:39", "how-to-build-the-perfect-team"],
  ["Mastering Digital Marketing with Freddy Vasquez", "2019-01-28", "32:20", "mastering-digital-marketing-with-freddy-vasquez"],
  ["What is an Entrepreneur with Gary Seibert", "2019-01-28", "22:44", "what-is-an-entrepreneur-with-gary-seibert"],
  ["Sales 101 with John Whitehall", "2019-01-28", "34:21", "sales-101-with-john-whitehall"],
  ["Welcome to the Small Business Resource Show", "2019-01-27", "22:44", "welcome-to-the-small-business-resource-show"]
];

export const sbraPodcastEpisodes: SbraPodcastEpisode[] = podcastRows.map(([title, date, duration, slug]) => ({
  title,
  date,
  duration,
  url: `https://sbrashow.libsyn.com/${slug}`
}));

const article = (title: string, topic: SbraArticle["topic"], path: string): SbraArticle => ({
  title,
  topic,
  url: `https://www.sbrassociation.com/${path}`
});

export const sbraArticles: SbraArticle[] = [
  article("Transition Your Business from Surviving to Thriving", "Business growth", "blog/transition-your-business-from-surviving-to-thriving"),
  article("Which Social Media Platform is Right for You?", "Marketing", "blog/which-social-media-platform-is-right-for-you"),
  article("The Art of Negotiating", "Business growth", "blog/the-art-of-negotiating"),
  article("Emerging Entrepreneurs Academy Provides High School Students With the Opportunity to Explore a Career as an Entrepreneur", "Community", "blog/emerging-entrepreneurs-academy-provides-high-school-students-with-the-opportunity-to-explore-a-career-as-an-entrepreneur"),
  article("Storytelling is the Marketing Shake-Up You Need — Here’s Why", "Marketing", "storytelling-is-the-marketing-shake-up-you-need-heres-why"),
  article("Who’s in Your Network?", "Business growth", "whos-in-your-network"),
  article("What are Your Questions, Concerns and Needs?", "Community", "blog/what-are-your-questions-concerns-and-needs"),
  article("Small Business Economic Forecast", "Money & funding", "blog/small-business-economic-forecast"),
  article("SBA Announces Simpler PPP Forgiveness for Loans of $50,000 or Less", "COVID-19 archive", "blog/sba-announces-simpler-ppp-forgiveness-for-loans-of-50-000-or-less"),
  article("Resources Available for Self-Employed Individuals, Sole-Proprietors, and Independent Contractors in the CARES Act", "COVID-19 archive", "blog/resources-available-for-self-employed-individuals-sole-proprietors-and-independent-contractors-in-the-cares-act"),
  article("The Greater Reading Area Grant — Apply Now", "Money & funding", "blog/the-greater-area-reading-grant-apply-now"),
  article("Grant Money Available for Small Business in the Greater Reading Area", "Money & funding", "blog/grant-money-available-for-small-business-in-the-greater-reading-area"),
  article("Small Business Grants Available", "Money & funding", "blog/small-business-grants-available"),
  article("How to Actually Get PPP Forgiveness", "COVID-19 archive", "blog/how-to-actually-get-ppp-forgiveness"),
  article("Support Our Restaurants", "Community", "blog/support-our-restaurants"),
  article("COVID Cases are Up While Deaths are Way, Way Down", "COVID-19 archive", "blog/covid-cases-are-up-while-deaths-are-way-way-down"),
  article("Loan Forgiveness Application Revised", "COVID-19 archive", "blog/loan-forgiveness-application-revised"),
  article("Important Changes: H.R. 7010 PPP Flexibility Act", "COVID-19 archive", "blog/important-changes-h-r-7010-ppp-flexibility-act"),
  article("Berks County Small Business Restart Loan Program", "Money & funding", "blog/berks-county-small-business-restart-loan-program"),
  article("Business Reopen Survey Results", "COVID-19 archive", "blog/business-reopen-survey-results"),
  article("PPP Loan Forgiveness Application Instructions", "COVID-19 archive", "blog/ppp-loan-forgiveness-application-instructions"),
  article("Just for Small Business", "Business growth", "blog/just-for-small-business"),
  article("Get Ready, Get Set, Open", "COVID-19 archive", "blog/get-ready-get-set-open"),
  article("Show Us Your Sticker Challenge", "Community", "blog/show-us-your-sticker-challenge"),
  article("If at First You Did Not Succeed with PPP, Try, Try Again", "COVID-19 archive", "blog/if-at-first-you-did-not-succeed-with-ppp-try-try-again"),
  article("Plan to Reopen PA Businesses", "COVID-19 archive", "blog/plan-to-reopen-pa-businesses"),
  article("Payment Protection Program: Riverfront FCU Application", "COVID-19 archive", "blog/payment-protection-program-riverfront-fcu-application"),
  article("PA Unemployment Compensation Available Soon for Self-Employed", "COVID-19 archive", "blog/pa-unemployment-comp-available-soon-for-self-employed-learn-more"),
  article("Information Regarding IRS Relief Money", "COVID-19 archive", "blog/information-regarding-irs-relief-money"),
  article("Telephone Town Hall Meeting", "COVID-19 archive", "blog/telephone-town-hall-meeting"),
  article("COVID-19 Small Business Update from Congressman Dan Meuser", "COVID-19 archive", "blog/covid-19-small-business-update-from-congressman-dan-meuser"),
  article("M&T Bank: Helping You Get It Right", "COVID-19 archive", "blog/m-t-bank-helping-you-get-it-right"),
  article("Protecting Yourself from Zoom Vulnerabilities", "COVID-19 archive", "blog/protecting-yourself-from-zoom-vulnerabilities"),
  article("Are You Prepared for Back to Normal — or a New Tomorrow?", "COVID-19 archive", "blog/are-you-prepared-for-back-to-normal-or-a-new-tomorrow"),
  article("What a Small Business Owner Should Do in a Crisis", "People & leadership", "blog/what-a-small-business-owner-should-do-in-a-crisis"),
  article("A Family Work-at-Home Survival Plan in a Crisis", "People & leadership", "blog/a-family-work-at-home-survival-plan-in-a-crisis"),
  article("Important Coronavirus Update from U.S. Congressman Dan Meuser", "COVID-19 archive", "blog/important-coronavirus-update-us-congressman-dan-meuser"),
  article("A Salute to America", "Community", "blog/a-salute-to-america"),
  article("SBA Disaster Assistance in Response to the Coronavirus", "COVID-19 archive", "blog/sba-disaster-assistance-in-response-to-the-coronavirus")
];

export const sbraSupportResources: SbraSupportResource[] = [
  { title: "Contact SBRA", group: "Get help", description: "Call 814-808-7272, email the SBRA team, or use the official contact form.", url: "https://www.sbrassociation.com/contact" },
  { title: "Request a business assessment", group: "Get help", description: "Identify opportunities for change and receive recommendations for growth.", url: "https://www.sbrassociation.com/business-assessment-application" },
  { title: "Request a Huddle", group: "Get help", description: "Ask a confidential team of experienced members for help solving a business challenge.", url: "https://www.sbrassociation.com/huddle-application" },
  { title: "Request The Pitch", group: "Get help", description: "Get help preparing a business plan and presentation for lenders or investors.", url: "https://www.sbrassociation.com/pitch-application" },
  { title: "Collective Minds information", group: "Get help", description: "Ask about SBRA’s confidential, facilitated peer problem-solving program.", url: "https://www.sbrassociation.com/collective-minds-info-request" },
  { title: "Membership benefits guide", group: "Member programs", description: "Business improvement, employee development, family enrichment, networking, coaching, and training.", url: "https://www.sbrassociation.com/membership-benefits" },
  { title: "Join the SBRA", group: "Member programs", description: "Review the official membership overview and current calls to action.", url: "https://www.sbrassociation.com/join" },
  { title: "Apply for membership", group: "Member programs", description: "Complete the official membership application, roster, profile, and consent information.", url: "https://www.sbrassociation.com/application" },
  { title: "Chapter locations", group: "Member programs", description: "Find SBRA chapter and regional membership information.", url: "https://www.sbrassociation.com/chapters" },
  { title: "Member presentations", group: "Member programs", description: "Tuesday Tune Up and workshop videos presented by SBRA members.", url: "https://www.sbrassociation.com/member-presentations" },
  { title: "Members-only benefit center", group: "Member programs", description: "The official doorway to discounts, offers, presentations, promotions, and member requests.", url: "https://www.sbrassociation.com/members-only" },
  { title: "Member-to-member discounts", group: "Member programs", description: "Browse the public directory of discounts offered by SBRA businesses.", url: "https://www.sbrassociation.com/member-to-member-discounts" },
  { title: "Member-to-member offers", group: "Member programs", description: "Open protected special offers from SBRA businesses.", url: "https://www.sbrassociation.com/member-to-member-offers", access: "Member login required" },
  { title: "Nationwide discounts", group: "Member programs", description: "Member savings on entertainment, travel, technology, gifts, and more.", url: "https://www.sbrassociation.com/nationwide-discounts", access: "Member login required" },
  { title: "Emerging Entrepreneurs Academy", group: "Member programs", description: "Program and support information for students interested in entrepreneurship.", url: "https://www.sbrassociation.com/ee-academy" },
  { title: "Insurance for members", group: "Benefits & policies", description: "Explore SBRA business, personal, health, life, disability, and property coverage resources.", url: "https://www.sbrassociation.com/insurance" },
  { title: "Group health, disability, and life insurance", group: "Benefits & policies", description: "Read group coverage information and request help with employee benefits.", url: "https://www.sbrassociation.com/group-health-disability-and-life-insurance" },
  { title: "Property and casualty insurance", group: "Benefits & policies", description: "Review property and casualty coverage resources for member businesses.", url: "https://www.sbrassociation.com/property-and-casualty-insurance" },
  { title: "Personal insurance", group: "Benefits & policies", description: "Explore homeowners, auto, umbrella, flood, and related personal coverage.", url: "https://www.sbrassociation.com/personal-insurance" },
  { title: "Member phone systems", group: "Benefits & policies", description: "Review the SBRA member phone-system program and service details.", url: "https://www.sbrassociation.com/phone-systems" },
  { title: "Website privacy policy", group: "Benefits & policies", description: "Read how the official SBRA website handles personal information.", url: "https://www.sbrassociation.com/privacy-policy" },
  { title: "Website terms and text-message help", group: "Benefits & policies", description: "Official website terms, SMS assistance, and opt-out instructions.", url: "https://www.sbrassociation.com/website-terms-of-use" },
  { title: "Display your business", group: "Promote your business", description: "Learn about opportunities to feature your business through SBRA.", url: "https://www.sbrassociation.com/display-your-business" },
  { title: "Submit a member discount", group: "Promote your business", description: "Share a special offer with other SBRA members.", url: "https://www.sbrassociation.com/show-us-your-discount" },
  { title: "Show us your sticker", group: "Promote your business", description: "Submit a promotional member photo and tagline to SBRA.", url: "https://www.sbrassociation.com/show-us-your-sticker" },
  { title: "Advertising opportunities", group: "Promote your business", description: "Review billboard, email, event, podcast, and website sponsorship options.", url: "https://www.sbrassociation.com/advertising-opportunities" },
  { title: "SBRA Marketplace", group: "Promote your business", description: "Explore official advertising and marketplace opportunities.", url: "https://www.sbrassociation.com/marketplace" },
  { title: "Member job listings", group: "Promote your business", description: "View or promote employment opportunities from SBRA member businesses.", url: "https://www.sbrassociation.com/member-job-listings" },
  { title: "Office space available", group: "Member programs", description: "Check availability and contact details for office space at SBRA.", url: "https://www.sbrassociation.com/rent-office-space-pa-reading" },
  { title: "Host an SBRA Mingle", group: "Promote your business", description: "Request to showcase your business by hosting a member Mingle.", url: "https://www.sbrassociation.com/host-an-sbra-mingle", access: "Member login required" },
  { title: "Present a Tuesday Tuneup", group: "Promote your business", description: "Request a member presentation slot to share your expertise.", url: "https://www.sbrassociation.com/present-a-tuesday-tuneup", access: "Member login required" },
  { title: "Submit an article to Route 422 Business Advisor", group: "Promote your business", description: "Request publication of a member article in Route 422 Business Advisor.", url: "https://www.sbrassociation.com/submit-article-422-bus-adv", access: "Member login required" },
  { title: "Submit newsletter news or an article", group: "Promote your business", description: "Send member news or educational content for the SBRA newsletter.", url: "https://www.sbrassociation.com/submit-news-for-newsletter", access: "Member login required" },
  { title: "Update your member profile", group: "Member programs", description: "Upload or update official member information and assets.", url: "https://www.sbrassociation.com/member-upload", access: "Member login required" }
];
