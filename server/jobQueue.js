/**
 * jobQueue.js – Manages the distributed job queue for the cluster.
 *
 * Jobs are dispatched to connected nodes by the server. Each job tracks
 * which node is handling it and its current state.
 */

const { v4: uuidv4 } = require('uuid');

const JOB_STATES = {
  PENDING:  'pending',
  RUNNING:  'running',
  PAUSED:   'paused',
  DONE:     'done',
  FAILED:   'failed',
};

class JobQueue {
  constructor() {
    /** @type {Map<string, object>} jobId → job object */
    this.jobs = new Map();
  }

  /**
   * Create a new job and add it to the queue.
   * @param {string} preset  Name of the preset to run.
   * @param {object} params  Preset-specific parameters.
   * @param {string} targetMode  'headless' | 'display' | 'all'
   * @returns {object} The created job.
   */
  createJob(preset, params = {}, targetMode = 'all') {
    const job = {
      id: uuidv4(),
      preset,
      params,
      targetMode,
      state: JOB_STATES.PENDING,
      createdAt: Date.now(),
      assignedNode: null,
      result: null,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  /**
   * Assign a pending job to a node.
   * @param {string} jobId
   * @param {string} nodeId
   */
  assignJob(jobId, nodeId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    job.assignedNode = nodeId;
    job.state = JOB_STATES.RUNNING;
    return job;
  }

  /**
   * Mark a job as paused.
   * @param {string} jobId
   */
  pauseJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job && job.state === JOB_STATES.RUNNING) {
      job.state = JOB_STATES.PAUSED;
    }
    return job;
  }

  /**
   * Resume a paused job.
   * @param {string} jobId
   */
  resumeJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job && job.state === JOB_STATES.PAUSED) {
      job.state = JOB_STATES.RUNNING;
    }
    return job;
  }

  /**
   * Mark a job as completed and store its result.
   * @param {string} jobId
   * @param {*} result
   */
  completeJob(jobId, result) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.state = JOB_STATES.DONE;
      job.result = result;
      job.completedAt = Date.now();
    }
    return job;
  }

  /**
   * Mark a job as failed.
   * @param {string} jobId
   * @param {string} error
   */
  failJob(jobId, error) {
    const job = this.jobs.get(jobId);
    if (job) {
      job.state = JOB_STATES.FAILED;
      job.error = error;
    }
    return job;
  }

  /**
   * Stop all running jobs. Used by the kill switch.
   */
  stopAll() {
    for (const job of this.jobs.values()) {
      if (job.state === JOB_STATES.RUNNING || job.state === JOB_STATES.PENDING) {
        job.state = JOB_STATES.FAILED;
        job.error = 'Stopped by kill switch';
      }
    }
  }

  /**
   * Remove a job from the queue entirely.
   * @param {string} jobId
   */
  removeJob(jobId) {
    this.jobs.delete(jobId);
  }

  /** Return all jobs as an array. */
  all() {
    return Array.from(this.jobs.values());
  }

  /** Return jobs filtered by state. */
  byState(state) {
    return this.all().filter(j => j.state === state);
  }
}

module.exports = { JobQueue, JOB_STATES };
