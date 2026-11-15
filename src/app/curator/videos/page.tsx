'use client';
import { useAccount } from '@/components/shell/account-context';
import { useMyStudents } from '@/components/features/students';
import { CuratorVideoList } from '@/components/features/qa';
import { useMaxVideoMb } from '@/lib/settings';
import { PageHeader } from '@/components/ui/misc';

export default function CuratorVideosPage() {
  const me = useAccount();
  const { data, names } = useMyStudents(me.id);
  const maxMb = useMaxVideoMb();
  return (
    <>
      <PageHeader title="Сұрақ-жауап видеолары" subtitle="Апталық видеоны жүктеп, оқушыларға тағайындаңыз және кім қарағанын бақылаңыз." />
      <CuratorVideoList curatorId={me.id} students={data ?? []} names={names} maxMb={maxMb} />
    </>
  );
}
