import axios, { AxiosInstance} from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_UR ?? 'http://localhost:4000';

export const apiClient: AxiosInstance = axios.create({
    baseURL: BASE_URL,  
    timeout: 30_000,
    headers: { 'Content-Type': 'application/json'},
});


//Attach token on every request
apiClient.interceptors.request.use(async (config) => {
const token = await SecureStore.getItemAsync('glimms_access_token');
if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

//Auto refresh on 401
apiClient.interceptors.response.use(
    (res) => res,
    async (error) => {
        const original = error.config;
        if(error.response?.status === 401 && !original._retry){
            original._retry = true;
            try {
                const refresh = await SecureStore.getItemAsync('glimmms_refresh_token');
                if (!refresh) throw new Error('No refresh token');
                const {data} = await axios.post(`${BASE_URL}/api/auth/refresh`, {refreshToken: refresh});
                await SecureStore.setItemAsync('glimms_access_token', data.accessToken);
                apiClient.defaults.headers.common['Authorization']= `Bearer ${data.accessToken}`;
                original.headers.Authorization = `Bearer ${data.accessToken}`;
                return apiClient(original);
            } catch {
                await SecureStore.deleteItemAsync('glimms_access_token');
                await SecureStore.deleteItemAsync('glimms_Refresh_token');
            }
        }

        return Promise.reject(error);
    }
);