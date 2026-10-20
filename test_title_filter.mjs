import { buildTitleFilter } from './scan.mjs';

const titleFilter = buildTitleFilter({
  positive: [
    'IT Support Engineer', 'IT Support Specialist', 'IT Support Analyst', 'IT Analyst',
    'Help Desk Analyst', 'Helpdesk Analyst', 'Service Desk Analyst', 'Technical Support Analyst',
    'End User Support Analyst', 'EUC Analyst', 'Technical Support Engineer', 'Desktop Support Engineer',
    'Desktop Support Analyst', 'Systems Support Engineer', 'Infrastructure Support Engineer',
    'Cybersecurity Engineer', 'Cyber Security Engineer', 'Security Engineer', 'SOC Analyst',
    'Security Operations Analyst', 'Cybersecurity Analyst', 'Cyber Security Analyst',
    'Information Security Analyst', 'IT Engineer', 'Systems Engineer', 'System Engineer',
    'IT Systems Engineer', 'Infrastructure Engineer', 'IT Infrastructure Engineer',
    'Windows Systems Engineer', 'Microsoft Systems Engineer', 'M365 Engineer',
    'Microsoft 365 Engineer', 'Modern Workplace Engineer', 'Systems Administrator',
    'System Administrator', 'Microsoft 365 Administrator', 'M365 Administrator',
    'Endpoint Engineer', 'Endpoint Administrator', 'IAM Analyst', 'Security Analyst',
    'Security Operations Engineer', 'Incident Response Analyst', 'Cyber Defense Analyst',
    'Blue Team Analyst', 'Network Security Analyst'
  ],
  negative: ['Intern', 'Software Engineer', 'Application Security Engineer', 'Product Security Engineer', 'Cloud Security Engineer']
});

console.log('=== Testing title matches ===');
console.log('IT Support Engineer:', titleFilter('IT Support Engineer'));
console.log('IT Analyst:', titleFilter('IT Analyst'));
console.log('Cyber-Security Operations Analyst III:', titleFilter('Cyber-Security Operations Analyst III'));
console.log('Senior Systems Engineer:', titleFilter('Senior Systems Engineer'));
console.log('Lead Quality Systems Engineer:', titleFilter('Lead Quality Systems Engineer'));
console.log('Commercial Credit Analyst I/II/III:', titleFilter('Commercial Credit Analyst I/II/III'));
console.log('Systems Engineer:', titleFilter('Systems Engineer'));
console.log('Security Engineer:', titleFilter('Security Engineer'));
console.log('Cybersecurity Analyst:', titleFilter('Cybersecurity Analyst'));
console.log('Information Security Analyst:', titleFilter('Information Security Analyst'));
console.log('Infrastructure Engineer:', titleFilter('Infrastructure Engineer'));
console.log('Endpoint Engineer:', titleFilter('Endpoint Engineer'));
console.log('IAM Analyst:', titleFilter('IAM Analyst'));
console.log('Incident Response Analyst:', titleFilter('Incident Response Analyst'));
console.log('Senior Infrastructure Engineer:', titleFilter('Senior Infrastructure Engineer'));