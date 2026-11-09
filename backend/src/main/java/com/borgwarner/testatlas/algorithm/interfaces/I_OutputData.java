/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package com.borgwarner.testatlas.algorithm.interfaces;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.util.List;

/**
 *
 * @author adperez
 */
public interface I_OutputData {
	@JsonIgnore
	default List<String> executionIssues() {
		return List.of();
	}
}
