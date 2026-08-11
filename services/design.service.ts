import { apiClient } from './api.client';

export const designService = {
    listJobs: () => apiClient.get('/design/jobs'),
    getJob: (jobId: string) => apiClient.get(`/design/jobs/${jobId}`).then(res => res.data),
    getSaved: () => apiClient.get('/design/saved').then(res => res.data),
    toggleSave: (designId: string) => apiClient.post(`/design/saved/${designId}`).then(res => res.data),
};