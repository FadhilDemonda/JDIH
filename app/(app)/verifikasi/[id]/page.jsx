'use client';

import { useParams } from 'next/navigation';
import { VerificationDetailView } from '@/components/views/VerificationDetailView';

export default function VerifikasiDetailPage() {
  const { id } = useParams();
  return <VerificationDetailView versionId={id} />;
}
