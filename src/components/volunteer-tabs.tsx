import { Compass, Calendar, HandHeart } from 'lucide-react-native';

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
  {
    name: 'donate',
    label: 'Donate',
    href: '/(tabs)/donate',
    icon: HandHeart,
  },
];
