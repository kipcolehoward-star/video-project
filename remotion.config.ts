import {Config} from '@remotion/cli/config';

// Tuned for a 2-core / 4 GB machine: more parallel tabs would swap.
// Override per render with --concurrency.
Config.setConcurrency(2);
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(90);
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setOverwriteOutput(true);
Config.setEntryPoint('src/index.ts');
