import { FaWalking, FaArrowRight, FaRegUser } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { useApp, useSelectBookingType } from '@/context/AppContext';
import { announce } from '@/lib/utils';
import homeBackground from '@/assets/home_bk.png';

export default function HomeScreen() {
  const { state, navigate } = useApp();
  const selectType = useSelectBookingType();

  function handleGetStarted() {
    // Preselect the default booking type, then let user pick a sport on page 2.
    selectType('court');
    announce('Get Started selected. Choose your sport.');
    navigate('sport-select');
  }

  function handleLogin() {
    announce('Log in selected');
    navigate('login');
  }

  return (
    <div className="home-splash screen-fade-enter">
      <div className="home-splash-frame" role="img" aria-label="SportyGo home background image">
        <img src={homeBackground} alt="SportyGo Play Learn Grow home screen" className="home-splash-image" />

        <Button
          className="home-hotspot home-hotspot-start"
          variant="secondary"
          onClick={handleGetStarted}
        >
          <FaWalking className="home-hotspot-walk-icon" color="#ffffff" aria-hidden="true" />
          <span className="home-hotspot-label">Get Started</span>
          <FaArrowRight className="home-hotspot-arrow" color="#ffffff" aria-hidden="true" />
        </Button>

        {!state.isLoggedIn && (
          <Button
            className="home-hotspot home-hotspot-login home-hotspot-login-btn"
            variant="secondary"
            aria-label="Log In"
            onClick={handleLogin}
          >
            <FaRegUser className="home-hotspot-login-icon" color="#ffffff" aria-hidden="true" />
            <span className="home-hotspot-label">Log In</span>
            <FaArrowRight className="home-hotspot-arrow" color="#ffffff" aria-hidden="true" />
          </Button>
        )}

        <div className="home-join-line" aria-label="Join the movement">
          <span>Join the movement.</span>
          <span className="home-join-heart" aria-hidden="true">❤</span>
        </div>
      </div>
    </div>
  );
}
