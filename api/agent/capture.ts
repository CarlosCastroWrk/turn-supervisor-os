import { verifyCaptureUser } from '../../server/ai/captureAuth.js';
import { createCaptureHandler } from '../../server/ai/captureHandler.js';
import { runOpenAiCapture } from '../../server/ai/openaiCapture.js';

const handleCaptureRequest = createCaptureHandler({
  authenticate: verifyCaptureUser,
  parseModel: runOpenAiCapture,
});

export default {
  fetch: handleCaptureRequest,
};
