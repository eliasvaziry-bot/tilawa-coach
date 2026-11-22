import { LatencyCard, MetronomeCard, MicCard, NoiseCard, PitchGraph, RangeCard, RecordTestCard, TransposeCard } from '../components/AudioSetup.tsx';
import { micInfo } from '../../audio/mic.ts';
import { settings, updateSettings } from '../state.ts';

export default function AudioLabScreen() {
  const s = settings.value;
  const ready = !!micInfo.value;
  return (
    <>
      <MicCard />
      {ready ? (
        <>
          <NoiseCard />
          <RecordTestCard />
          <LatencyCard />
          <RangeCard />
          <div class="card">
            <h2>Live pitch</h2>
            <PitchGraph tonicHz={s.tonicHz ?? 130.8} />
          </div>
          <MetronomeCard />
          <TransposeCard />
          {!s.onboarded ? (
            <div class="card">
              <p class="small">Done with the checks above?</p>
              <button class="btn primary" onClick={() => updateSettings({ onboarded: true })}>
                Setup finished
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div class="task-now">
          <b>YOUR TASK NOW:</b> press "Allow microphone" above.
        </div>
      )}
    </>
  );
}
