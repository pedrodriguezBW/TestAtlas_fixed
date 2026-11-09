package com.borgwarner.testatlas;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** Standalone Test Atlas backend (extracted from the Engineering Toolbox backend). */
@SpringBootApplication
public class TestAtlasApplication {

	public static void main(String[] args) {
		SpringApplication.run(TestAtlasApplication.class, args);
	}

}
