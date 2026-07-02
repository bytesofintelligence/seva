import { Compass, Calendar } from 'lucide-react-native';

export const VOLUNTEER_TABS = [
  {
    name: 'index',
    label: 'Browse',
    href: '/(tabs)',
    icon: Compass,
  },
  {
    name: 'schedule',
    label: 'Schedule',
    href: '/(tabs)/schedule',
    icon: Calendar,
  },
];
