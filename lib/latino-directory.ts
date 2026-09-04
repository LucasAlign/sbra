import type { Business, Member } from "@/lib/types";

// Public member records from the Berks County Latino Chamber of Commerce
// Join It directory, captured September 3, 2026.
const records = [
  ["Alberto Polanco", "Fritura Kings", "Restaurante", "friturakings21@gmail.com", "", "444 Lancaster Ave, Reading, PA 19611", "https://res.cloudinary.com/joinit/image/upload/c_fill,h_100,w_100/v1780501089/dfjzc1efn9ztbuoaud1v.png", ""],
  ["Victor Ocasio", "OmniV Global Systems, LLC", "Director ejecutivo", "victor@omniv.net", "+19084227936", "2100 N. 13th Street, Reading, PA 19612", "https://res.cloudinary.com/joinit/image/upload/c_fill,h_100,w_100/v1787590103/flic1oov7mp6shyyuquv.png", "https://omniv.net"],
  ["Erica Kunkel", "Penn State Berks", "Educación continua y Berks LaunchBox", "els5014@psu.edu", "+16103966221", "2100 Stoudt Road, Wyomissing, PA 19610", "", "https://berks.psu.edu"],
  ["Wuedy Reyes Rodriguez", "FreshTown Supermarket", "Supermercado", "freshtownsupermarketllc@gmail.com", "+16093212814", "1310 Schuylkill Ave, Reading, PA 19601", "", ""],
  ["Belgica Guzman", "Belgica Guzman Real Estate & Notary", "Bienes raíces y notaría", "belgicaguzman.realestate@gmail.com", "+14847946255", "Reading, PA", "", ""],
  ["Carmen Booker", "House of Portalatin", "Organización comunitaria", "houseofportalatin@gmail.com", "+14847971434", "123 Spring Street, Reading, PA", "https://res.cloudinary.com/joinit/image/upload/c_fill,h_100,w_100/v1776747255/twpttiaewbqhnob37d70.jpg", ""],
  ["Josephine Boykins", "I-LEAD USA", "Desarrollo comunitario", "josie.boykins@i-leadusa.org", "", "Berks County, PA", "", "https://i-leadusa.org"],
  ["Dario Walcott", "First National Bank", "Servicios bancarios", "riowalcott@gmail.com", "", "Berks County, PA", "", "https://www.fnb-online.com"],
  ["Franklyn Fleming", "Franklyn’s Breakfast Burgers & Shakes", "Restaurante", "franklyn58@comcast.net", "+14848180743", "1007 Penn St, Reading, PA 19601", "", ""],
  ["Chris Nein", "Mortgage America Inc.", "Préstamos hipotecarios", "cnein@mortgagebankamerica.com", "+16103340633", "1100 Berkshire Blvd., Suite 120, Wyomissing, PA 19610", "https://res.cloudinary.com/joinit/image/upload/c_fill,h_100,w_100/v1774275788/javp6wtg8lttdbexvbjr.png", "https://mortgageamerica.com"],
  ["Jobany Bedoya", "Jobany Bedoya", "Miembro comunitario", "jobany.bedoya@gmail.com", "+17174050830", "285 Riverview Dr, Ephrata, PA 17522", "", ""],
  ["Kenneth Alier", "Citizens", "Servicios bancarios", "kenneth.alier@citizensbank.com", "+16109142444", "Berks County, PA", "", "https://www.citizensbank.com"],
  ["Yurico Rodriguez Batista", "RENA-SER Business Solutions Corp.", "Soluciones empresariales", "yurico@berksmultiservicehub.com", "+19178581678", "1920 Kutztown Rd., Suite J, Reading, PA 19604", "https://res.cloudinary.com/joinit/image/upload/c_fill,h_100,w_100/v1773848605/gmslzdv0klaxxex35krn.jpg", "https://berksmultiservicehub.com"],
  ["Rafael Moya", "Rafael Moya", "Miembro comunitario", "rafaelmoyafernandez69@gmail.com", "+14847218491", "806 Red Rock Cir, Royersford, PA 19468", "https://res.cloudinary.com/joinit/image/upload/c_fill,h_100,w_100/v1783608849/ay50lv44qrvxrrgzbtnd.png", ""],
  ["Christopher Nein", "Referral Partners Plus", "Red de referidos", "cnein@ptd.net", "", "1100 Berkshire Blvd., Wyomissing, PA 19610", "", ""],
  ["Kennide Ravelo", "360 Painting", "Pintura residencial y comercial", "kravelo@360painting.com", "+14842126161", "Berks County, PA", "", "https://www.360painting.com"],
  ["Mildred Torres Ramirez", "Daisy Day Care Center", "Cuidado infantil", "tmildred@ymail.com", "+14845298780", "101 Spring St, Reading, PA 19601", "", ""],
  ["Edvard Philipson", "Philipson Business Consulting", "Consultoría empresarial", "edvard.philipson@gmail.com", "+14846341034", "1951 Meadow Lane, Wyomissing, PA 19610", "https://res.cloudinary.com/joinit/image/upload/c_fill,h_100,w_100/v1765507511/fqjnvjxr75s4mykruvm3.jpg", ""],
  ["Rosana Martinez", "Rosana Martinez", "Miembro comunitario", "", "+14847060738", "Berks County, PA", "", ""],
  ["Tanya Melendez", "Green Building Alliance", "Edificios sostenibles", "tanyam@gba.org", "+16108231599", "233 Court Street, Reading, PA 19601", "https://res.cloudinary.com/joinit/image/upload/c_fill,h_100,w_100/v1772222175/izzt1vgzqstk9bkmhmeg.jpg", "https://www.gba.org"],
  ["Sarah Mailloux", "Kutztown University SBDC", "Desarrollo de pequeñas empresas", "sbdc@kutztown.edu", "", "15200 Kutztown Road, Kutztown, PA 19530", "", "https://www.kutztownsbdc.org"],
  ["Itzamara Garcia", "PACE Consulting Solutions", "Consultoría", "igarcia2@pace-cs.com", "+14849372700", "Berks County, PA", "", "https://pace-cs.com"],
  ["Adrian Horacio Heredia", "KimonoMono, LLC", "Mercadeo y estrategia", "adrian@kimonomono.io", "+14845777919", "Mohnton, PA 19540", "https://res.cloudinary.com/joinit/image/upload/c_fill,h_100,w_100/v1769449872/z3ty5tw7ndbm8wvpakzp.png", "https://kimonomono.io"],
  ["Violet Emory", "Tec Centro Berks", "Desarrollo de la fuerza laboral", "emoryv@blwdc.org", "+14846504740", "Berks County, PA", "", "https://teccentroberks.org"],
  ["William Medina", "William Medina", "Participación comunitaria", "willmedina143@outlook.com", "+14842820376", "Berks County, PA", "https://res.cloudinary.com/joinit/image/upload/c_fill,h_100,w_100/v1770732936/nxomphrsmu48xazydjik.jpg", ""],
  ["Eli Castro", "Integrity", "Mercadeo", "elicastro@midagencies.com", "+14077151195", "60 Commerce Dr, Wyomissing, PA 19610", "https://res.cloudinary.com/joinit/image/upload/c_fill,h_100,w_100/v1772074959/giazx64ni6qv46sickce.jpg", "https://midagencies.com"]
] as const;

function slug(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function websiteLogo(website: string) {
  if (!website) return "";
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(website).hostname)}&sz=256`;
}

export const latinoBusinessSeed: Business[] = records.map(([contact, company, category, , , address, photo, website]) => ({
  id: `latino-${slug(company)}`,
  name: company,
  category,
  description: `${company} forma parte de la Cámara de Comercio Latina del Condado de Berks.`,
  servicesOffered: category,
  referralsWanted: "Abierto a conexiones relevantes dentro de la comunidad.",
  website,
  address,
  city: address.includes("Reading") ? "Reading, PA" : "Berks County, PA",
  tier: "small",
  logo: websiteLogo(website) || photo,
  memberOffer: ""
}));

export const latinoMemberSeed: Member[] = records.map(([name, company, category, email, phone, , photo]) => ({
  id: `latino-${slug(name)}`,
  businessId: `latino-${slug(company)}`,
  name,
  title: category,
  email,
  phone,
  bio: `Miembro de la Cámara de Comercio Latina del Condado de Berks que representa a ${company}.`,
  isOwner: false,
  photo
}));
