/** A small Luma-style export so the import can be tried without a real file. */
const PEOPLE = [
  ['Aarav Sharma', 'Null Pointers', 'Veg', 'M'], ['Diya Patel', 'Byte Busters', 'Non-veg', 'S'],
  ['Kabir Singh', 'Null Pointers', 'Veg', 'L'], ['Ananya Iyer', '', 'Jain', 'S'],
  ['Vihaan Gupta', 'Kernel Panic', 'Veg', 'XL'], ['Meera Nair', 'Kernel Panic', 'Vegan', 'M'],
  ['Arjun Reddy', 'Hot Reload', 'Non-veg', 'L'], ['Ishita Banerjee', 'Hot Reload', 'Veg', 'S'],
  ['Rohan Mehta', '', 'Non-veg', 'XXL'], ['Saanvi Kulkarni', 'Off By One', 'Veg', 'M'],
  ['Aditya Rao', 'Off By One', 'Veg', 'L'], ['Kavya Menon', 'Root Access', 'Jain', 'S'],
  ['Reyansh Joshi', 'Root Access', 'Non-veg', 'M'], ['Tara Chatterjee', '', 'Veg', 'XS'],
  ['Vivaan Desai', 'Async Avengers', 'Veg', 'L'], ['Nisha Pillai', 'Async Avengers', 'Vegan', 'M'],
  ['Dev Malhotra', 'Stack Smashers', 'Non-veg', 'XL'], ['Riya Kapoor', 'Stack Smashers', 'Veg', 'S'],
  ['Arnav Bhat', '', 'Veg', 'M'], ['Pooja Hegde', 'Lazy Loaders', 'Non-veg', 'M'],
  ['Siddharth Jain', 'Lazy Loaders', 'Jain', 'L'], ['Aisha Khan', 'Merge Conflict', 'Non-veg', 'S'],
  ['Karan Verma', 'Merge Conflict', 'Veg', 'L'], ['Zoya Siddiqui', '', 'Veg', 'M'],
];

export function sampleLumaCsv(): string {
  const head = 'api_id,name,first_name,last_name,email,phone_number,approval_status,Team name,Food preference,T-shirt size';
  const lines = PEOPLE.map(([name, team, food, size], i) => {
    const [first, last] = name.split(' ');
    const status = i >= PEOPLE.length - 4 ? 'waitlist' : 'approved';
    const phone = '+918797827294';
    return [`gst-${1000 + i}`, name, first, last, `${first.toLowerCase()}.${last.toLowerCase()}@example.com`, phone, status, team, food, size]
      .map((v) => (/[,"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',');
  });
  return [head, ...lines].join('\n');
}
