import { Composition } from 'remotion';
import { Promo, DURATION } from './Promo.jsx';

export function Root() {
  return (
    <Composition id="DixlabPromo" component={Promo} durationInFrames={DURATION} fps={30} width={1920} height={1080} />
  );
}
