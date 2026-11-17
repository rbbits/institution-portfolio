import request from 'supertest';
import app from './index';
import axios from 'axios';

// Mock axios so tests do not depend on live Europe PMC services (Requirement 8)
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GET /institution-portfolio', () => {
    it('should return 400 Bad Request if institution parameter is missing', async () => {
        const response = await request(app).get('/institution-portfolio');
        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
    });

    it('should return 400 Bad Request if limit is out of bounds', async () => {
        const response = await request(app).get('/institution-portfolio?institution=Cambridge&limit=25');
        expect(response.status).toBe(400);
    });

    it('should return a portfolio successfully when mocked Grist returns valid data', async () => {
        // Mock Grist API response
        mockedAxios.get.mockResolvedValueOnce({
            data: {
                RecordList: {
                    Record: [
                        {
                            Grant: {
                                Id: 'GRANT123',
                                Title: 'Test Grant',
                                Funder: { Name: 'Wellcome Trust' }
                            },
                            Institution: { Name: 'University of Cambridge' }
                        }
                    ]
                }
            }
        });

        // Mock Articles API response
        mockedAxios.get.mockResolvedValueOnce({
            data: {
                resultList: {
                    result: [
                        {
                            id: '12345',
                            source: 'MED',
                            title: 'Test Publication',
                            grantsList: {
                                grant: [{ grantId: 'GRANT123', agency: 'Wellcome Trust' }]
                            }
                        }
                    ]
                }
            }
        });

        const response = await request(app).get('/institution-portfolio?institution=University%20of%20Cambridge&limit=1&publicationsPerGrant=1');
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('requestedInstitution', 'University of Cambridge');
        expect(response.body.grants.length).toBe(1);
        expect(response.body.grants[0].publicationStatus).toBe('PUBLICATIONS_FOUND');
    });

    it('should mark a grant as LOOKUP_ERROR when its article lookup fails', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            data: {
                RecordList: {
                    Record: [{
                        Grant: { Id: 'GRANT999', Title: 'Failing Grant', Funder: { Name: 'Wellcome Trust' } },
                        Institution: { Name: 'University of Cambridge' }
                    }]
                }
            }
        });
        mockedAxios.get.mockRejectedValueOnce(new Error('timeout'));

        const response = await request(app).get('/institution-portfolio?institution=Cambridge&limit=1');

        expect(response.status).toBe(200);
        expect(response.body.grants[0].publicationStatus).toBe('LOOKUP_ERROR');
        expect(response.body.grants[0].errorMessage).toBe('timeout');
    });

    afterEach(() => {
        mockedAxios.get.mockReset();
    });

    const gristRecord = (id: string) => ({
        data: {
            RecordList: {
                Record: [{
                    Grant: { Id: id, Title: 'Test Grant', Funder: { Name: 'Wellcome Trust' } },
                    Institution: { Name: 'University of Cambridge' }
                }]
            }
        }
    });

    it('should return 502 when the Grist API is unreachable', async () => {
        mockedAxios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));

        const response = await request(app).get('/institution-portfolio?institution=Cambridge');

        expect(response.status).toBe(502);
        expect(response.body).toHaveProperty('error');
    });

    it('should mark a grant as NONE_FOUND when no articles are returned', async () => {
        mockedAxios.get.mockResolvedValueOnce(gristRecord('GRANT456'));
        mockedAxios.get.mockResolvedValueOnce({ data: { resultList: { result: [] } } });

        const response = await request(app).get('/institution-portfolio?institution=Cambridge&limit=1');

        expect(response.status).toBe(200);
        expect(response.body.grants[0].publicationStatus).toBe('NONE_FOUND');
        expect(response.body.grants[0].publications).toEqual([]);
    });

    it('should mark a grant as UNCERTAIN_ASSOCIATION when the funder does not match', async () => {
        mockedAxios.get.mockResolvedValueOnce(gristRecord('GRANT789'));
        mockedAxios.get.mockResolvedValueOnce({
            data: {
                resultList: {
                    result: [{
                        id: '67890',
                        source: 'MED',
                        title: 'Unrelated Publication',
                        grantsList: { grant: [{ grantId: 'GRANT789', agency: 'Medical Research Council' }] }
                    }]
                }
            }
        });

        const response = await request(app).get('/institution-portfolio?institution=Cambridge&limit=1');

        expect(response.status).toBe(200);
        expect(response.body.grants[0].publicationStatus).toBe('UNCERTAIN_ASSOCIATION');
        expect(response.body.grants[0].publications[0].verifiedAssociation).toBe(false);
    });
});
