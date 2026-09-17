import Link from 'next/link';
import { RenqunMark } from '@/components/RenqunMark';

export default function NotFound() {
  return (
    <div className="shell page">
      <section className="card empty" style={{ maxWidth: 520, margin: '40px auto' }}>
        <span className="empty-mark">
          <RenqunMark size={34} />
        </span>
        <h1 className="heading">This page isn&apos;t here</h1>
        <p className="body">The rounds are on the Markets page.</p>
        <Link className="btn red" href="/">
          Go to Markets
        </Link>
      </section>
    </div>
  );
}
