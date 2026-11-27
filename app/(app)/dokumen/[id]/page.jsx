'use client';

import { useParams } from 'next/navigation';
import { DocumentDetailView } from '@/components/views/DocumentDetailView';

export default function DokumenDetailPage() {
  const { id } = useParams();
  return <DocumentDetailView docId={id} />;
}
