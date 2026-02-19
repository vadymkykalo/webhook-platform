package com.webhook.platform.worker.service;

import com.webhook.platform.common.util.CryptoUtils;
import com.webhook.platform.worker.domain.entity.Endpoint;
import io.netty.handler.ssl.SslContext;
import io.netty.handler.ssl.SslContextBuilder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.TrustManagerFactory;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class MtlsWebClientFactory {

    private final String encryptionKey;
    private final String encryptionSalt;
    private final WebClient.Builder webClientBuilder;
    private final Map<UUID, CachedClient> mtlsClientCache = new ConcurrentHashMap<>();

    private record CachedClient(WebClient webClient, Instant updatedAt) {}

    public MtlsWebClientFactory(
            @Value("${webhook.encryption-key}") String encryptionKey,
            @Value("${webhook.encryption-salt}") String encryptionSalt,
            WebClient.Builder webClientBuilder) {
        this.encryptionKey = encryptionKey;
        this.encryptionSalt = encryptionSalt;
        this.webClientBuilder = webClientBuilder;
    }

    public WebClient getWebClient(Endpoint endpoint) {
        if (!Boolean.TRUE.equals(endpoint.getMtlsEnabled())) {
            return webClientBuilder.build();
        }

        CachedClient cached = mtlsClientCache.get(endpoint.getId());
        Instant endpointUpdatedAt = endpoint.getUpdatedAt();
        
        // Invalidate cache if endpoint was updated after cache entry was created
        if (cached != null && endpointUpdatedAt != null 
                && cached.updatedAt() != null 
                && endpointUpdatedAt.isAfter(cached.updatedAt())) {
            log.info("mTLS config changed for endpoint {}, invalidating cached client", endpoint.getId());
            mtlsClientCache.remove(endpoint.getId());
            cached = null;
        }
        
        if (cached != null) {
            return cached.webClient();
        }
        
        try {
            WebClient client = createMtlsWebClient(endpoint);
            mtlsClientCache.put(endpoint.getId(), new CachedClient(client, endpointUpdatedAt));
            return client;
        } catch (Exception e) {
            log.error("Failed to create mTLS WebClient for endpoint {}: {}", endpoint.getId(), e.getMessage());
            throw new RuntimeException("Failed to create mTLS client", e);
        }
    }

    public void invalidateCache(UUID endpointId) {
        mtlsClientCache.remove(endpointId);
        log.debug("Invalidated mTLS WebClient cache for endpoint {}", endpointId);
    }

    private WebClient createMtlsWebClient(Endpoint endpoint) throws Exception {
        String clientCert = CryptoUtils.decryptSecret(
                endpoint.getClientCertEncrypted(),
                endpoint.getClientCertIv(),
                encryptionKey,
                encryptionSalt
        );
        String clientKey = CryptoUtils.decryptSecret(
                endpoint.getClientKeyEncrypted(),
                endpoint.getClientKeyIv(),
                encryptionKey,
                encryptionSalt
        );

        X509Certificate certificate = loadCertificate(clientCert);
        PrivateKey privateKey = loadPrivateKey(clientKey);

        KeyStore keyStore = KeyStore.getInstance("PKCS12");
        keyStore.load(null, null);
        keyStore.setKeyEntry("client", privateKey, new char[0], new X509Certificate[]{certificate});

        KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        kmf.init(keyStore, new char[0]);

        SslContextBuilder sslContextBuilder = SslContextBuilder.forClient()
                .keyManager(kmf);

        if (endpoint.getCaCert() != null && !endpoint.getCaCert().isEmpty()) {
            X509Certificate caCertificate = loadCertificate(endpoint.getCaCert());
            KeyStore trustStore = KeyStore.getInstance("PKCS12");
            trustStore.load(null, null);
            trustStore.setCertificateEntry("ca", caCertificate);

            TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            tmf.init(trustStore);
            sslContextBuilder.trustManager(tmf);
        }

        SslContext sslContext = sslContextBuilder.build();

        HttpClient httpClient = HttpClient.create()
                .secure(spec -> spec.sslContext(sslContext));

        log.info("Created mTLS WebClient for endpoint {}", endpoint.getId());

        return webClientBuilder
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .build();
    }

    private X509Certificate loadCertificate(String pem) throws Exception {
        String certContent = pem
                .replace("-----BEGIN CERTIFICATE-----", "")
                .replace("-----END CERTIFICATE-----", "")
                .replaceAll("\\s", "");

        byte[] decoded = Base64.getDecoder().decode(certContent);
        CertificateFactory cf = CertificateFactory.getInstance("X.509");
        return (X509Certificate) cf.generateCertificate(new ByteArrayInputStream(decoded));
    }

    private PrivateKey loadPrivateKey(String pem) throws Exception {
        String keyContent = pem
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replace("-----BEGIN RSA PRIVATE KEY-----", "")
                .replace("-----END RSA PRIVATE KEY-----", "")
                .replaceAll("\\s", "");

        byte[] decoded = Base64.getDecoder().decode(keyContent);
        PKCS8EncodedKeySpec keySpec = new PKCS8EncodedKeySpec(decoded);
        
        try {
            KeyFactory kf = KeyFactory.getInstance("RSA");
            return kf.generatePrivate(keySpec);
        } catch (Exception e) {
            KeyFactory kf = KeyFactory.getInstance("EC");
            return kf.generatePrivate(keySpec);
        }
    }
}
