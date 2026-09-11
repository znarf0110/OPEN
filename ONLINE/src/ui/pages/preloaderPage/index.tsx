import { Store } from '../../../store';
import './style.less';

export const PreloaderPage = () => {
  return (
    <div className="preloader-page">
      <div className="buttons">
        <button onClick={() => Store.playOffline()}>Play Offline</button>
        <button onClick={() => Store.playOnline()}>Play Online</button>
      </div>
    </div>
  );
};
