import './globals.css';

export const metadata = {
  title: 'Caseflow · QA benchmark',
  description: 'A neutral support app for comparing UI, API, and source-based testing tools.',
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
