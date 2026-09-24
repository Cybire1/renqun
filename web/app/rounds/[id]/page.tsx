import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RoundPage } from '@/components/RoundPage';

type Props = { params: Promise<{ id: string }> };

const parseId = (raw: string): bigint | null => (/^\d{1,12}$/.test(raw) && raw !== '0' ? BigInt(raw) : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Round #${id}` };
}

export default async function Round({ params }: Props) {
  const id = parseId((await params).id);
  if (id == null) notFound();
  return <RoundPage id={id} />;
}
