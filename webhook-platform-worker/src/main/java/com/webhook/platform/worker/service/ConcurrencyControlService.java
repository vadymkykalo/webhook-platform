package com.webhook.platform.worker.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;

@Service
@Slf4j
public class ConcurrencyControlService {

    private final Map<UUID, Semaphore> semaphores = new ConcurrentHashMap<>();
    private final int maxConcurrentPerEndpoint;
    
    public ConcurrencyControlService(
            @Value("${webhook.max-concurrent-per-endpoint:5}") int maxConcurrentPerEndpoint) {
        this.maxConcurrentPerEndpoint = maxConcurrentPerEndpoint;
    }
    
    public boolean tryAcquire(UUID endpointId) {
        Semaphore semaphore = semaphores.computeIfAbsent(endpointId, 
            id -> new Semaphore(maxConcurrentPerEndpoint));
        return semaphore.tryAcquire();
    }
    
    public void release(UUID endpointId) {
        Semaphore semaphore = semaphores.get(endpointId);
        if (semaphore != null) {
            semaphore.release();
        }
    }
}
