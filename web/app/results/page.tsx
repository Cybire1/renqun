import type { Metadata } from 'next';
import { Results } from '@/components/Results';

export const metadata: Metadata = { title: 'Results' };

export default function ResultsPage() {
  return <Results />;
}
