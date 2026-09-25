import type { Business } from "./types";

// Replace only recognized stale imported copy; keep administrator-written edits.
const corrections = [
  {
    "name": "FXV Digital Design",
    "before": "At First Financial Group®, we know that financial success is the result of discipline, hard work, and smart, informed decision-making. To build and maintain an effective financial strategy, it’s important to seek out the right people who look to understand what is important to you, guide you, and provide long-term support as you move through the various stages of your financial life.",
    "after": "Digital marketing, web design, and website hosting services for small businesses."
  },
  {
    "name": "GKS Brown Realty",
    "before": "Our firm provides access to some of the best financial minds in the business, with strong risk-management skills, and a full array of products and services. I will work with you to identify the right strategies to achieve and protect your goals and your dreams.",
    "after": "Real estate services for buyers, sellers, and property owners in Berks County."
  },
  {
    "name": "Golden Rule Remodeling",
    "before": "Helping to … Optimize your wealth. Achieve your goals. Protect your dreams. Contact me today to discuss turning your dreams into realities.",
    "after": "Residential remodeling and home improvement services in Berks County."
  },
  {
    "name": "Good Life Companies",
    "before": "Disclosure Info",
    "after": "Good Life Companies is listed in the SBRA directory under Financial Services. Contact the business for service details."
  },
  {
    "name": "New Life to Live LLC",
    "before": "NASA-backed, FDA-cleared Air and Surface sanitation and purification devices for continuous, 24/7 decontamination for all inhabited spaces in the commercial and residential markets.",
    "after": "Functional nutrition coaching for individuals seeking practical support for healthier living."
  }
];

export function repairDirectoryBusiness(business: Business): Business {
  const correction = corrections.find((item) => item.name === business.name && item.before === business.description);
  const clean = (value: string) => value.replace(/Comertial/g, "Commercial").replace(/Manages Service Security Provider/g, "Managed Service Security Provider").replace(/covenient/g, "convenient");
  return { ...business, description: clean(correction?.after ?? business.description), category: clean(business.category), servicesOffered: clean(business.servicesOffered) };
}

export function directoryCategory(category: string): string {
  const value = category.trim();
  const groups: [RegExp, string][] = [
    [/^(Bank|Banking|Banking solutions|Financial Credit Union|Banking & credit unions)$/i, "Banking & credit unions"],
    [/^(Accounting|Certified Public Accountants|Accounting & tax)$/i, "Accounting & tax"],
    [/^(Attorney|Legal Services)$/i, "Legal services"],
    [/^(Real Estate|Realty)$/i, "Real estate"],
    [/^(Chiropractor|Chiropractic Services|Chiropractic)$/i, "Chiropractic"],
    [/marketing|advertising|creative print and web design/i, "Marketing & design"],
    [/^(IT Service|IT Managed Service Provider|Manages Service Security Provider|Managed Service Security Provider)$/i, "IT & cybersecurity"],
    [/janitorial|commercial cleaning|comertial/i, "Cleaning & restoration"],
    [/^(Financial|Financial Services|Financial Advising Services)$/i, "Financial services"],
    [/^(Restaurant|Restaurant and Retail Seafood Market|Authentic Japanese Cuisine|Coffee Shop|Cafe Restaurant)$/i, "Food & dining"],
    [/^(Coaching|Business Coaching|Business Training|Leadership development coaching)$/i, "Business coaching & training"],
    [/^(Insurance|Insurance and Human Resources|Health Insurance-Individuals •Families •Small Business)$/i, "Insurance"],
    [/^(Senior Care Facility|Senior Services|Non-medical home care|Transitional moving & downsizing services for seniors & consignment sales)$/i, "Senior & home care"]
  ];
  return groups.find(([pattern]) => pattern.test(value))?.[1] ?? value;
}
