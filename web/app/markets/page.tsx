import type { Metadata } from 'next';
import { Markets } from '@/components/Markets';

export const metadata: Metadata = { title: 'Markets' };

export default function MarketsPage() {
  return <Markets />;
}
