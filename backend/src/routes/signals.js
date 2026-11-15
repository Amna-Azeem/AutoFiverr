// routes/signals.js - gives the form its list of signs, so the form can only offer what the backend can check.
// Mount it:   import signalsRouter from './routes/signals.js';   app.use('/api/signals', signalsRouter);
import { Router } from 'express';
import { listSignals, listPresets, SIGNAL_GROUPS, MAX_SIGNALS } from '../agents/signalCatalog.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ signals: listSignals(), groups: SIGNAL_GROUPS, presets: listPresets(), maxSignals: MAX_SIGNALS });
});

export default router;