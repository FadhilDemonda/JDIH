'use client';

import { useParams } from 'next/navigation';
import { DraftEditorView } from '@/components/views/DraftEditorView';

export default function EditDrafPage() {
  const { id } = useParams();
  return <DraftEditorView versionId={id} />;
}
