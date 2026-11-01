import WeekView from '../../components/WeekView';

export const metadata = {
  title: 'This week’s parlay · Our Holm League',
  openGraph: { title: 'This week’s parlay', description: 'Every leg, live during games' },
};

export default function WeekPage() {
  return <WeekView />;
}
