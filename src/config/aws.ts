export type AwsComputeConfig = {
  region: string;
  artifactBucket?: string;
  jobQueue?: string;
  apiBaseUrl: string;
};

export const awsComputeConfig: AwsComputeConfig = {
  region: import.meta.env.VITE_AWS_REGION ?? "us-east-1",
  artifactBucket: import.meta.env.VITE_SIMULATION_ARTIFACT_BUCKET,
  jobQueue: import.meta.env.VITE_SIMULATION_JOB_QUEUE,
  apiBaseUrl: import.meta.env.VITE_SIMULATION_API_BASE_URL ?? "http://localhost:5173"
};
