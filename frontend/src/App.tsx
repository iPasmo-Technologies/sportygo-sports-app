import { useApp } from '@/context/AppContext';
import { CalendarDays, Compass, GraduationCap, Home, User } from 'lucide-react';
import Header from '@/components/Header';
import BottomIconNav from '@/components/BottomIconNav';
import HomeScreen from '@/screens/HomeScreen';
import SportSelectScreen from '@/screens/SportSelectScreen';
import SportEventsScreen from '@/screens/SportEventsScreen';
import SportFacilityScreen from '@/screens/SportFacilityScreen';
import SlotBookingScreen from '@/screens/SlotBookingScreen';
import TermsScreen from '@/screens/TermsScreen';
import LoginScreen from '@/screens/LoginScreen';
import ForgotPasswordScreen from '@/screens/ForgotPasswordScreen';
import CheckoutScreen from '@/screens/CheckoutScreen';
import BookingConfirmationScreen from '@/screens/BookingConfirmationScreen';
import ViewBookingsScreen from '@/screens/ViewBookingsScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import PaymentTestScreen from '@/screens/PaymentTestScreen';
import BlockSlotBookingScreen from '@/screens/BlockSlotBookingScreen';
import InstallAppPrompt from '@/components/InstallAppPrompt';

export default function App() {
  const { state, navigate } = useApp();
  const isImmersiveScreen = state.screen === 'home' || state.screen === 'sport-select' || state.screen === 'sport-events' || state.screen === 'facility-select' || state.screen === 'schedule' || state.screen === 'terms' || state.screen === 'login' || state.screen === 'forgot-password' || state.screen === 'checkout' || state.screen === 'booking-confirmation' || state.screen === 'bookings' || state.screen === 'profile' || state.screen === 'payment-test' || state.screen === 'block-slots';
  const topAlignedImmersive = state.screen === 'schedule' || state.screen === 'terms' || state.screen === 'forgot-password' || state.screen === 'checkout' || state.screen === 'booking-confirmation' || state.screen === 'bookings' || state.screen === 'profile' || state.screen === 'payment-test' || state.screen === 'block-slots';
  const showBottomNav = state.screen !== 'home' && state.screen !== 'login' && state.screen !== 'forgot-password' && state.screen !== 'block-slots';
  const activeBottomItem = state.screen === 'home'
    ? 'home'
    : state.screen === 'sport-select' || state.screen === 'sport-events' || state.screen === 'facility-select'
      ? 'explore'
      : state.screen === 'profile'
        ? 'profile'
        : 'bookings';

  return (
    <div className={`app-shell${isImmersiveScreen ? ' home-mode' : ''}${topAlignedImmersive ? ' immersive-top' : ''}${showBottomNav ? ' with-bottom-nav' : ''}`}>
      {/* ARIA live region for screen-reader announcements */}
      <div id="a11y-live" className="a11y-live" aria-live="polite" aria-atomic="true" />

      {!isImmersiveScreen && <Header />}

      {state.screen === 'home'     && <HomeScreen />}
      {state.screen === 'sport-select' && <SportSelectScreen />}
      {state.screen === 'sport-events' && <SportEventsScreen />}
      {state.screen === 'facility-select' && <SportFacilityScreen />}
      {state.screen === 'schedule' && <SlotBookingScreen />}
      {state.screen === 'terms' && <TermsScreen />}
      {state.screen === 'login'    && <LoginScreen />}
      {state.screen === 'forgot-password' && <ForgotPasswordScreen />}
      {state.screen === 'checkout' && <CheckoutScreen />}
      {state.screen === 'booking-confirmation'  && <BookingConfirmationScreen />}
      {state.screen === 'bookings' && <ViewBookingsScreen />}
      {state.screen === 'profile' && <ProfileScreen />}
      {state.screen === 'payment-test' && <PaymentTestScreen />}
      {state.screen === 'block-slots' && <BlockSlotBookingScreen />}

      {showBottomNav && (
        <BottomIconNav
          items={[
            {
              key: 'home',
              label: 'Home',
              icon: Home,
              active: activeBottomItem === 'home',
              onClick: () => navigate('home'),
            },
            {
              key: 'explore',
              label: 'Explore',
              icon: Compass,
              active: activeBottomItem === 'explore',
              onClick: () => navigate('sport-select'),
            },
            {
              key: 'bookings',
              label: 'My Bookings',
              icon: CalendarDays,
              active: activeBottomItem === 'bookings',
              onClick: () => navigate('bookings'),
            },
            {
              key: 'academy',
              label: 'Academy',
              icon: GraduationCap,
              onClick: () => navigate('sport-events'),
            },
            {
              key: 'profile',
              label: 'Profile',
              icon: User,
              active: activeBottomItem === 'profile',
              onClick: () => navigate('profile'),
            },
          ]}
        />
      )}
      <InstallAppPrompt />
    </div>
  );
}
